const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

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

// Arquivo de persistência
const USERS_FILE = './usuarios.json';
const ESCROWS_FILE = './escrows.json';

// Funções de leitura e escrita
function loadUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            fs.writeFileSync(USERS_FILE, '[]');
            return [];
        }
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Erro ao carregar usuários:', err);
        return [];
    }
}

function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error('Erro ao salvar usuários:', err);
    }
}

function loadEscrows() {
    try {
        if (!fs.existsSync(ESCROWS_FILE)) {
            fs.writeFileSync(ESCROWS_FILE, '[]');
            return [];
        }
        const data = fs.readFileSync(ESCROWS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Erro ao carregar escrows:', err);
        return [];
    }
}

function saveEscrows(escrows) {
    try {
        fs.writeFileSync(ESCROWS_FILE, JSON.stringify(escrows, null, 2));
    } catch (err) {
        console.error('Erro ao salvar escrows:', err);
    }
}

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
                
                const users = loadUsers();
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
                const escrows = loadEscrows();
                const escrowIndex = escrows.findIndex(e => e.id === escrow.id);
                
                if (escrowIndex !== -1 && escrows[escrowIndex].status === 'waiting_payment') {
                    // Atualizar status
                    escrows[escrowIndex].status = 'paid';
                    escrows[escrowIndex].paidAt = new Date().toISOString();
                    escrows[escrowIndex].updatedAt = new Date().toISOString();
                    
                    // Usar o valor REAL do escrow
                    const paymentAmount = escrows[escrowIndex].value || 0;
                    
                    // Atualizar saldo do vendedor
                    const users = loadUsers();
                    const sellerIndex = users.findIndex(u => u.id === escrows[escrowIndex].sellerId);
                    
                    if (sellerIndex !== -1) {
                        users[sellerIndex].pendingBalance = (users[sellerIndex].pendingBalance || 0) + paymentAmount;
                        users[sellerIndex].availableBalance = users[sellerIndex].availableBalance || 0;
                        
                        console.log(`✅ Saldo EM ANDAMENTO do vendedor ${users[sellerIndex].username} atualizado: R$ ${users[sellerIndex].pendingBalance}`);
                        
                        users[sellerIndex].balanceHistory = users[sellerIndex].balanceHistory || [];
                        users[sellerIndex].balanceHistory.push({
                            type: 'pending',
                            amount: paymentAmount,
                            escrowId: escrows[escrowIndex].id,
                            escrowCode: escrows[escrowIndex].code,
                            timestamp: new Date().toISOString(),
                            description: `Pagamento intermédio ${escrows[escrowIndex].code}`,
                            status: 'credited'
                        });
                        
                        saveUsers(users);
                        
                        io.emit('balance_updated', {
                            userId: users[sellerIndex].id,
                            pendingBalance: users[sellerIndex].pendingBalance,
                            availableBalance: users[sellerIndex].availableBalance
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
                    
                    escrows[escrowIndex].chat = escrows[escrowIndex].chat || [];
                    escrows[escrowIndex].chat.push(paymentMessage);
                    saveEscrows(escrows);
                    
                    io.to(escrows[escrowIndex].id).emit('new_message', paymentMessage);
                    
                    console.log(`✅ Pagamento automático processado para ${escrows[escrowIndex].code} - Valor: R$ ${paymentAmount}`);
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
        
        const users = loadUsers();
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
        saveUsers(users);
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
        
        const users = loadUsers();
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

// Rotas protegidas
app.get('/api/profile', authMiddleware, (req, res) => {
    const users = loadUsers();
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
    const users = loadUsers();
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

// ROTA DE SAQUE CORRIGIDA
app.post('/api/balance/withdraw', authMiddleware, (req, res) => {
    try {
        const { amount, cvu, fullName, bank, bankName } = req.body;
        const userId = req.user.id;
        
        console.log('Solicitação de saque recebida:', {
            userId,
            amount,
            cvu,
            fullName,
            bank,
            bankName
        });
        
        if (!amount || !cvu || !fullName) {
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
                error: 'Valor mínimo para saque: $ 10.00' 
            });
        }
        
        const users = loadUsers();
        const userIndex = users.findIndex(u => u.id === userId);
        
        if (userIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                error: 'Usuário não encontrado' 
            });
        }
        
        // Verificar se o usuário tem saldo disponível
        users[userIndex].availableBalance = users[userIndex].availableBalance || 0;
        
        console.log('Saldo disponível do usuário:', users[userIndex].availableBalance);
        console.log('Valor solicitado:', numericAmount);
        
        if (users[userIndex].availableBalance < numericAmount) {
            return res.status(400).json({ 
                success: false, 
                error: 'Saldo disponível insuficiente' 
            });
        }
        
        // Calcular taxa de 0.5%
        const fee = numericAmount * 0.005;
        const netAmount = numericAmount - fee;
        
        // SUBTRAIR O VALOR DO SALDO DISPONÍVEL
        users[userIndex].availableBalance = users[userIndex].availableBalance - numericAmount;
        
        console.log('Novo saldo disponível após saque:', users[userIndex].availableBalance);
        
        // Registrar no histórico
        users[userIndex].balanceHistory = users[userIndex].balanceHistory || [];
        users[userIndex].balanceHistory.push({
            type: 'withdraw',
            amount: -numericAmount, // Negativo para indicar saída
            fee: fee,
            netAmount: netAmount,
            cvu: cvu,
            fullName: fullName,
            bank: bank,
            bankName: bankName || 'Banco Argentina',
            currency: 'ARS',
            timestamp: new Date().toISOString(),
            description: `Saque via CVU para ${fullName}`,
            status: 'processing'
        });
        
        // Salvar alterações
        saveUsers(users);
        
        // Emitir atualização de saldo via WebSocket
        io.emit('balance_updated', {
            userId: users[userIndex].id,
            pendingBalance: users[userIndex].pendingBalance || 0,
            availableBalance: users[userIndex].availableBalance
        });
        
        res.json({
            success: true,
            message: 'Saque solicitado com sucesso!',
            withdraw: {
                id: Date.now().toString(),
                amount: numericAmount,
                fee: fee,
                netAmount: netAmount,
                cvu: cvu,
                fullName: fullName,
                bank: bank,
                bankName: bankName,
                currency: 'ARS',
                status: 'processing',
                timestamp: new Date().toISOString()
            },
            newBalance: users[userIndex].availableBalance // Enviar novo saldo na resposta
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
        
        const escrows = loadEscrows();
        escrows.push(escrow);
        saveEscrows(escrows);
        
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
        
        const escrows = loadEscrows();
        const escrowIndex = escrows.findIndex(e => e.code === code && e.status === 'awaiting_buyer');
        
        if (escrowIndex === -1) {
            return res.status(400).json({ 
                success: false, 
                error: 'Código inválido ou intermédio não disponível' 
            });
        }
        
        if (escrows[escrowIndex].sellerId === req.user.id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Você não pode comprar seu próprio item' 
            });
        }
        
        escrows[escrowIndex].buyerId = req.user.id;
        escrows[escrowIndex].buyerName = req.user.username;
        escrows[escrowIndex].status = 'waiting_payment';
        escrows[escrowIndex].updatedAt = new Date().toISOString();
        
        const welcomeMessage = {
            id: 'msg_' + Date.now(),
            senderId: 'system',
            senderName: 'Sistema',
            message: `🎉 ${req.user.username} entrou como comprador! Aguardando pagamento.`,
            timestamp: new Date().toISOString(),
            type: 'system'
        };
        
        escrows[escrowIndex].chat = escrows[escrowIndex].chat || [];
        escrows[escrowIndex].chat.push(welcomeMessage);
        
        saveEscrows(escrows);
        
        res.json({
            success: true,
            message: 'Você entrou no intermédio!',
            escrow: escrows[escrowIndex]
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
        const escrows = loadEscrows();
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
        const escrows = loadEscrows();
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
        const escrows = loadEscrows();
        const escrowIndex = escrows.findIndex(e => e.id === req.params.id);
        
        if (escrowIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                error: 'Intermédio não encontrado' 
            });
        }
        
        if (escrows[escrowIndex].buyerId !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                error: 'Apenas o comprador pode finalizar' 
            });
        }
        
        if (escrows[escrowIndex].status !== 'paid') {
            return res.status(400).json({ 
                success: false, 
                error: 'O intermédio precisa estar pago' 
            });
        }
        
        escrows[escrowIndex].status = 'completed';
        escrows[escrowIndex].completedAt = new Date().toISOString();
        escrows[escrowIndex].updatedAt = new Date().toISOString();
        
        const users = loadUsers();
        const sellerIndex = users.findIndex(u => u.id === escrows[escrowIndex].sellerId);
        
        if (sellerIndex !== -1) {
            const paymentAmount = escrows[escrowIndex].value || 0;
            
            users[sellerIndex].pendingBalance = users[sellerIndex].pendingBalance || 0;
            users[sellerIndex].availableBalance = users[sellerIndex].availableBalance || 0;
            
            users[sellerIndex].pendingBalance = users[sellerIndex].pendingBalance - paymentAmount;
            users[sellerIndex].availableBalance = users[sellerIndex].availableBalance + paymentAmount;
            
            users[sellerIndex].balanceHistory = users[sellerIndex].balanceHistory || [];
            users[sellerIndex].balanceHistory.push({
                type: 'release',
                amount: paymentAmount,
                escrowId: escrows[escrowIndex].id,
                escrowCode: escrows[escrowIndex].code,
                timestamp: new Date().toISOString(),
                description: `Liberação intermédio ${escrows[escrowIndex].code}`
            });
            
            saveUsers(users);
            
            io.emit('balance_updated', {
                userId: users[sellerIndex].id,
                pendingBalance: users[sellerIndex].pendingBalance,
                availableBalance: users[sellerIndex].availableBalance
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
        
        escrows[escrowIndex].chat = escrows[escrowIndex].chat || [];
        escrows[escrowIndex].chat.push(completionMessage);
        saveEscrows(escrows);
        
        io.to(escrows[escrowIndex].id).emit('new_message', completionMessage);
        
        res.json({
            success: true,
            message: 'Intermédio concluído!',
            escrow: escrows[escrowIndex]
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
        
        const escrows = loadEscrows();
        const escrow = escrows.find(e => e.id === escrowId);
        if (escrow && escrow.chat) {
            socket.emit('chat_history', escrow.chat);
        }
    });
    
    socket.on('send_message', (data) => {
        const { escrowId, userId, userName, message } = data;
        
        const escrows = loadEscrows();
        const escrowIndex = escrows.findIndex(e => e.id === escrowId);
        
        if (escrowIndex === -1) return;
        
        const chatMessage = {
            id: 'msg_' + Date.now(),
            senderId: userId,
            senderName: userName,
            message: message,
            timestamp: new Date().toISOString(),
            type: userId === escrows[escrowIndex].sellerId ? 'seller' : 'buyer'
        };
        
        escrows[escrowIndex].chat = escrows[escrowIndex].chat || [];
        escrows[escrowIndex].chat.push(chatMessage);
        saveEscrows(escrows);
        
        io.to(escrowId).emit('new_message', chatMessage);
        
        if (userId === escrows[escrowIndex].buyerId) {
            detectPayment(message, escrows[escrowIndex], io);
        }
    });
    
    socket.on('request_balance_update', (userId) => {
        const users = loadUsers();
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

// Criar arquivos se não existirem
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '[]');
    console.log('Arquivo usuarios.json criado com sucesso!');
}

if (!fs.existsSync(ESCROWS_FILE)) {
    fs.writeFileSync(ESCROWS_FILE, '[]');
    console.log('Arquivo escrows.json criado com sucesso!');
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('SAFETRADE GAMES - Sistema de Pagamento Automático');
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Usuários salvos em: ${USERS_FILE}`);
    console.log(`Escrows salvos em: ${ESCROWS_FILE}`);
    console.log('='.repeat(60));
});
