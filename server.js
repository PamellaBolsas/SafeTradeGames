const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Armazenamento em memória
const users = [];
const escrows = [];

// SISTEMA DE TOKEN
function createToken(userId) {
    return 'token-' + userId + '-simple-123';
}

// Middleware de autenticação SIMPLIFICADO
function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        
        if (!authHeader) {
            return res.status(401).json({ 
                success: false, 
                error: 'Token não fornecido' 
            });
        }
        
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return res.status(401).json({ 
                success: false, 
                error: 'Formato de token inválido' 
            });
        }
        
        const token = parts[1];
        
        if (token.startsWith('token-')) {
            const tokenParts = token.split('-');
            if (tokenParts.length >= 2) {
                const userId = tokenParts[1];
                
                let user = users.find(u => u.id === userId);
                
                if (!user) {
                    return res.status(401).json({ 
                        success: false, 
                        error: 'Usuário não encontrado' 
                    });
                }
                
                req.user = {
                    id: user.id,
                    username: user.username,
                    email: user.email
                };
                
                return next();
            }
        }
        
        return res.status(403).json({ 
            success: false, 
            error: 'Token inválido' 
        });
        
    } catch (error) {
        console.error('Erro na autenticação:', error);
        return res.status(403).json({ 
            success: false, 
            error: 'Erro na autenticação' 
        });
    }
}

// Função para detectar pagamento automático
function detectPayment(message, escrow, io) {
    const paymentPhrases = [
        'vou pagar aqui irmão',
        'vou pagar agora',
        'pagamento feito',
        'já paguei',
        'pago',
        'transferência realizada',
        'pix enviado'
    ];
    
    const lowerMessage = message.toLowerCase();
    
    for (const phrase of paymentPhrases) {
        if (lowerMessage.includes(phrase)) {
            console.log(`💰 DETECTANDO PAGAMENTO no intermédio ${escrow.code}`);
            
            setTimeout(() => {
                if (escrow.status === 'waiting_payment') {
                    // Atualizar status
                    escrow.status = 'paid';
                    escrow.paidAt = new Date().toISOString();
                    escrow.updatedAt = new Date().toISOString();
                    
                    // Usar o valor REAL do escrow
                    const paymentAmount = escrow.value || 0;
                    
                    // Atualizar saldo do vendedor
                    const seller = users.find(u => u.id === escrow.sellerId);
                    if (seller) {
                        seller.pendingBalance = (seller.pendingBalance || 0) + paymentAmount;
                        seller.availableBalance = seller.availableBalance || 0;
                        
                        console.log(`✅ Saldo EM ANDAMENTO do vendedor ${seller.username} atualizado: R$ ${seller.pendingBalance}`);
                        
                        seller.balanceHistory = seller.balanceHistory || [];
                        seller.balanceHistory.push({
                            type: 'pending',
                            amount: paymentAmount,
                            escrowId: escrow.id,
                            escrowCode: escrow.code,
                            timestamp: new Date().toISOString(),
                            description: `Pagamento intermédio ${escrow.code}`,
                            status: 'credited'
                        });
                        
                        io.emit('balance_updated', {
                            userId: seller.id,
                            pendingBalance: seller.pendingBalance,
                            availableBalance: seller.availableBalance
                        });
                    }
                    
                    const paymentMessage = {
                        id: 'payment_' + Date.now(),
                        senderId: 'system',
                        senderName: 'Sistema',
                        message: `💰 PAGAMENTO CONFIRMADO! Valor de R$ ${paymentAmount.toFixed(2)} foi creditado na conta do vendedor (saldo em andamento). Aguardando confirmação final do comprador para liberar para saque.`,
                        timestamp: new Date().toISOString(),
                        type: 'system'
                    };
                    
                    escrow.chat.push(paymentMessage);
                    io.to(escrow.id).emit('new_message', paymentMessage);
                    
                    console.log(`✅ Pagamento automático processado para ${escrow.code} - Valor: R$ ${paymentAmount}`);
                }
            }, 15000);
            
            return true;
        }
    }
    
    return false;
}

// Rotas de arquivos estáticos
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/chat.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/balance.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'balance.html'));
});

// Rota de registro - SIMPLIFICADA
app.post('/api/register', (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        console.log('Tentando registrar:', { username, email });
        
        if (!username || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Preencha todos os campos' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                error: 'Senha precisa de 6 caracteres' 
            });
        }
        
        const existingUser = users.find(u => u.email === email);
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email já está em uso' 
            });
        }
        
        const user = {
            id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            username,
            email,
            password,
            pendingBalance: 0,
            availableBalance: 0,
            balanceHistory: [],
            createdAt: new Date().toISOString()
        };
        
        users.push(user);
        console.log('Usuário criado:', user.username);
        
        const token = createToken(user.id);
        
        const { password: _, ...safeUser } = user;
        
        res.json({
            success: true,
            message: 'Conta criada com sucesso!',
            token,
            user: safeUser
        });
        
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro no servidor' 
        });
    }
});

// Rota de login - SIMPLIFICADA
app.post('/api/login', (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('Tentando login:', email);
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email e senha são obrigatórios' 
            });
        }
        
        const user = users.find(u => u.email === email && u.password === password);
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'Email ou senha incorretos' 
            });
        }
        
        const token = createToken(user.id);
        
        const { password: _, ...safeUser } = user;
        
        console.log('Login bem-sucedido:', user.username);
        
        res.json({
            success: true,
            message: 'Login realizado!',
            token,
            user: safeUser
        });
        
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro no servidor' 
        });
    }
});

// Rotas protegidas (mantenha as mesmas do original)
app.get('/api/profile', authMiddleware, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    
    if (!user) {
        return res.json({
            success: true,
            user: req.user
        });
    }
    
    const { password, ...safeUser } = user;
    res.json({ 
        success: true, 
        user: safeUser 
    });
});

app.get('/api/balance', authMiddleware, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    
    if (!user) {
        return res.json({
            success: true,
            balance: {
                pending: 0,
                available: 0
            },
            history: []
        });
    }
    
    user.pendingBalance = user.pendingBalance || 0;
    user.availableBalance = user.availableBalance || 0;
    user.balanceHistory = user.balanceHistory || [];
    
    res.json({
        success: true,
        balance: {
            pending: user.pendingBalance,
            available: user.availableBalance
        },
        history: user.balanceHistory
    });
});

app.post('/api/balance/withdraw', authMiddleware, (req, res) => {
    try {
        const { amount, pixKey, fullName } = req.body;
        const userId = req.user.id;
        
        if (!amount || !pixKey || !fullName) {
            return res.status(400).json({ 
                success: false, 
                error: 'Todos os campos são obrigatórios' 
            });
        }
        
        const numericAmount = parseFloat(amount);
        
        if (isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valor inválido' 
            });
        }
        
        if (numericAmount < 10) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valor mínimo para saque: R$ 10.00' 
            });
        }
        
        const user = users.find(u => u.id === userId);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'Usuário não encontrado' 
            });
        }
        
        user.availableBalance = user.availableBalance || 0;
        
        if (user.availableBalance < numericAmount) {
            return res.status(400).json({ 
                success: false, 
                error: 'Saldo disponível insuficiente' 
            });
        }
        
        const fee = numericAmount * 0.005;
        const netAmount = numericAmount - fee;
        
        user.availableBalance = user.availableBalance - numericAmount;
        
        user.balanceHistory = user.balanceHistory || [];
        user.balanceHistory.push({
            type: 'withdraw',
            amount: -numericAmount,
            fee: fee,
            netAmount: netAmount,
            pixKey: pixKey,
            fullName: fullName,
            timestamp: new Date().toISOString(),
            description: `Saque via PIX para ${fullName}`,
            status: 'processing'
        });
        
        io.emit('balance_updated', {
            userId: user.id,
            pendingBalance: user.pendingBalance,
            availableBalance: user.availableBalance
        });
        
        res.json({
            success: true,
            message: 'Saque solicitado com sucesso!',
            withdraw: {
                id: Date.now().toString(),
                amount: numericAmount,
                fee: fee,
                netAmount: netAmount,
                pixKey: pixKey,
                fullName: fullName,
                status: 'processing',
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Erro ao processar saque:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno do servidor' 
        });
    }
});

app.post('/api/escrow/create', authMiddleware, (req, res) => {
    try {
        const { itemName, value, description } = req.body;
        
        if (!itemName || !value) {
            return res.status(400).json({ 
                success: false, 
                error: 'Nome e valor do item são obrigatórios' 
            });
        }
        
        const generateCode = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let code = '';
            for (let i = 0; i < 3; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            code += '-';
            for (let i = 0; i < 3; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            code += '-';
            for (let i = 0; i < 3; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return code;
        };
        
        const escrow = {
            id: 'escrow_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            code: generateCode(),
            sellerId: req.user.id,
            sellerName: req.user.username,
            itemName,
            description: description || '',
            value: parseFloat(value),
            status: 'awaiting_buyer',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            chat: []
        };
        
        escrows.push(escrow);
        
        res.json({
            success: true,
            message: 'Intermédio criado com sucesso!',
            escrow
        });
        
    } catch (error) {
        console.error('Erro ao criar intermédio:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao criar intermédio' 
        });
    }
});

app.post('/api/escrow/join', authMiddleware, (req, res) => {
    try {
        const { code } = req.body;
        
        const escrow = escrows.find(e => e.code === code && e.status === 'awaiting_buyer');
        
        if (!escrow) {
            return res.status(400).json({ 
                success: false, 
                error: 'Código inválido ou intermédio não disponível' 
            });
        }
        
        if (escrow.sellerId === req.user.id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Você não pode comprar seu próprio item' 
            });
        }
        
        escrow.buyerId = req.user.id;
        escrow.buyerName = req.user.username;
        escrow.status = 'waiting_payment';
        escrow.updatedAt = new Date().toISOString();
        
        const welcomeMessage = {
            id: 'msg_' + Date.now(),
            senderId: 'system',
            senderName: 'Sistema',
            message: `🎉 ${req.user.username} entrou como comprador! Aguardando pagamento.`,
            timestamp: new Date().toISOString(),
            type: 'system'
        };
        
        escrow.chat.push(welcomeMessage);
        
        res.json({
            success: true,
            message: 'Você entrou no intermédio!',
            escrow
        });
        
    } catch (error) {
        console.error('Erro ao entrar no intermédio:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao entrar no intermédio' 
        });
    }
});

app.get('/api/escrow/:id', authMiddleware, (req, res) => {
    try {
        const escrow = escrows.find(e => e.id === req.params.id);
        
        if (!escrow) {
            return res.status(404).json({ 
                success: false, 
                error: 'Intermédio não encontrado' 
            });
        }
        
        const hasAccess = escrow.sellerId === req.user.id || 
                         escrow.buyerId === req.user.id;
        
        if (!hasAccess) {
            return res.status(403).json({ 
                success: false, 
                error: 'Acesso negado' 
            });
        }
        
        res.json({
            success: true,
            escrow
        });
        
    } catch (error) {
        console.error('Erro ao buscar intermédio:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno' 
        });
    }
});

app.get('/api/escrow', authMiddleware, (req, res) => {
    try {
        const userEscrows = escrows.filter(e => 
            e.sellerId === req.user.id || e.buyerId === req.user.id
        );
        
        res.json({ 
            success: true, 
            escrows: userEscrows 
        });
        
    } catch (error) {
        console.error('Erro ao listar intermédios:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno' 
        });
    }
});

app.post('/api/escrow/:id/complete', authMiddleware, (req, res) => {
    try {
        const escrow = escrows.find(e => e.id === req.params.id);
        
        if (!escrow) {
            return res.status(404).json({ 
                success: false, 
                error: 'Intermédio não encontrado' 
            });
        }
        
        if (escrow.buyerId !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                error: 'Apenas o comprador pode finalizar' 
            });
        }
        
        if (escrow.status !== 'paid') {
            return res.status(400).json({ 
                success: false, 
                error: 'O intermédio precisa estar pago' 
            });
        }
        
        escrow.status = 'completed';
        escrow.completedAt = new Date().toISOString();
        escrow.updatedAt = new Date().toISOString();
        
        const seller = users.find(u => u.id === escrow.sellerId);
        if (seller) {
            const paymentAmount = escrow.value || 0;
            
            seller.pendingBalance = seller.pendingBalance || 0;
            seller.availableBalance = seller.availableBalance || 0;
            
            seller.pendingBalance = seller.pendingBalance - paymentAmount;
            seller.availableBalance = seller.availableBalance + paymentAmount;
            
            seller.balanceHistory = seller.balanceHistory || [];
            seller.balanceHistory.push({
                type: 'release',
                amount: paymentAmount,
                escrowId: escrow.id,
                escrowCode: escrow.code,
                timestamp: new Date().toISOString(),
                description: `Liberação intermédio ${escrow.code}`
            });
            
            io.emit('balance_updated', {
                userId: seller.id,
                pendingBalance: seller.pendingBalance,
                availableBalance: seller.availableBalance
            });
        }
        
        const completionMessage = {
            id: 'msg_' + Date.now(),
            senderId: 'system',
            senderName: 'Sistema',
            message: '🎉 Transação concluída! O vendedor já pode sacar o valor.',
            timestamp: new Date().toISOString(),
            type: 'system'
        };
        
        escrow.chat.push(completionMessage);
        io.to(escrow.id).emit('new_message', completionMessage);
        
        res.json({
            success: true,
            message: 'Intermédio concluído!',
            escrow
        });
        
    } catch (error) {
        console.error('Erro ao completar intermédio:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno' 
        });
    }
});

// WebSocket
io.on('connection', (socket) => {
    console.log('Novo usuário conectado:', socket.id);
    
    socket.on('join_escrow', (escrowId) => {
        socket.join(escrowId);
        console.log(`${socket.id} entrou no chat ${escrowId}`);
        
        const escrow = escrows.find(e => e.id === escrowId);
        if (escrow && escrow.chat) {
            socket.emit('chat_history', escrow.chat);
        }
    });
    
    socket.on('send_message', (data) => {
        const { escrowId, userId, userName, message } = data;
        
        const escrow = escrows.find(e => e.id === escrowId);
        if (!escrow) return;
        
        const chatMessage = {
            id: 'msg_' + Date.now(),
            senderId: userId,
            senderName: userName,
            message: message,
            timestamp: new Date().toISOString(),
            type: userId === escrow.sellerId ? 'seller' : 'buyer'
        };
        
        if (!escrow.chat) escrow.chat = [];
        escrow.chat.push(chatMessage);
        
        io.to(escrowId).emit('new_message', chatMessage);
        
        if (userId === escrow.buyerId) {
            detectPayment(message, escrow, io);
        }
    });
    
    socket.on('request_balance_update', (userId) => {
        const user = users.find(u => u.id === userId);
        if (user) {
            socket.emit('balance_updated', {
                userId: user.id,
                pendingBalance: user.pendingBalance || 0,
                availableBalance: user.availableBalance || 0
            });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Usuário desconectado:', socket.id);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('SAFETRADE GAMES - Sistema de Pagamento Automático');
    console.log(`Porta: ${PORT}`);
    console.log(`Acesse: http://localhost:${PORT}`);
    console.log('='.repeat(60));
});
