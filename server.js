const express = require('express');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');

app.use(express.static(__dirname));

const DB_FILE = 'db.json';
let data = { messages: [], users: {} };

// Загрузка базы данных
if (fs.existsSync(DB_FILE)) {
    try {
        const fileContent = fs.readFileSync(DB_FILE);
        data = JSON.parse(fileContent);
    } catch (e) {
        console.log("Файл базы пуст или поврежден, создаем новый.");
    }
}

io.on('connection', (socket) => {
    console.log('Кто-то подключился');

    // Отправляем начальные данные
    socket.emit('init_data', { 
        users: Object.values(data.users).map(u => ({
            nickname: u.nickname, 
            sysName: u.sysName, 
            avatar: u.avatar, 
            username: u.username
        })),
        messages: data.messages || []
    });

    // Вход и регистрация
    socket.on('auth_request', (auth) => {
        const user = data.users[auth.username];
        if (auth.isRegister) {
            if (user) return socket.emit('auth_error', 'Логин занят!');
            socket.emit('auth_success', { username: auth.username, needProfile: true });
        } else {
            if (user && user.password === auth.password) {
                socket.emit('auth_success', { user, needProfile: false });
            } else {
                socket.emit('auth_error', 'Ошибка входа!');
            }
        }
    });

    // Сохранение профиля
    socket.on('save_profile', (profile) => {
        data.users[profile.username] = profile;
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        io.emit('update_users', Object.values(data.users).map(u => ({
            nickname: u.nickname, sysName: u.sysName, avatar: u.avatar, username: u.username
        })));
        socket.emit('profile_ready', profile);
    });

    // Вход в комнату чата
    socket.on('join_chat', (roomID) => {
        socket.join(roomID);
        const roomMessages = data.messages.filter(m => m.room === roomID);
        socket.emit('chat_history', roomMessages);
    });

    // Личное сообщение
    socket.on('message', (msg) => {
        data.messages.push(msg);
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        if (msg.room) {
            io.to(msg.room).emit('message', msg);
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ИСПРАВЛЕННЫЙ ЗАПУСК ДЛЯ ИНТЕРНЕТА
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`✅ СЕРВЕР ЗАПУЩЕН! Порт: ${PORT}`);
});