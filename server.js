const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let waitingUsers = [];
let totalOnline = 0;

// Simple Spam & Link Filter List
const BANNED_KEYWORDS = ['http://', 'https://', 'www.', '.com', '.net', '.org', 'buy premium'];

io.on('connection', (socket) => {
    totalOnline++;
    io.emit('update-user-count', totalOnline);

    socket.on('find-match', (interestsString) => {
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('stranger-disconnected');
            socket.leave(socket.currentRoom);
            socket.currentRoom = null;
        }

        const userInterests = interestsString
            ? interestsString.toLowerCase().split(',').map(i => i.trim()).filter(i => i !== "")
            : [];

        let matchIndex = -1;
        if (userInterests.length > 0) {
            matchIndex = waitingUsers.findIndex(stranger => {
                return stranger.interests.some(interest => userInterests.includes(interest));
            });
        }

        if (matchIndex === -1 && waitingUsers.length > 0) {
            matchIndex = 0;
        }

        if (matchIndex !== -1) {
            const strangerData = waitingUsers.splice(matchIndex, 1)[0];
            const strangerSocket = strangerData.socket;

            const roomName = `room-${socket.id}-${strangerSocket.id}`;
            socket.join(roomName);
            strangerSocket.join(roomName);

            socket.currentRoom = roomName;
            strangerSocket.currentRoom = roomName;

            io.to(roomName).emit('matched');
        } else {
            waitingUsers.push({ socket: socket, interests: userInterests });
            socket.emit('waiting');
        }
    });

    // --- NEW: MODERATION FILTERS ---
    socket.on('send-message', (text) => {
        if (!socket.currentRoom) return;

        // Check if message contains blocked links or spam phrases
        const containsSpam = BANNED_KEYWORDS.some(keyword => text.toLowerCase().includes(keyword));

        if (containsSpam) {
            // Warn the sender, don't pass message to the stranger
            socket.emit('system-warning', 'Links and advertising are not allowed here!');
            console.log(`Blocked spam attempt from: ${socket.id}`);
        } else {
            // Safe message. Pass it along
            socket.to(socket.currentRoom).emit('receive-message', text);
        }
    });

    // --- NEW: HANDLING REPORTS ---
    socket.on('report-stranger', () => {
        if (socket.currentRoom) {
            const roomToClose = socket.currentRoom;
            
            // Tell the rule breaker they've been flagged and disconnected
            socket.to(roomToClose).emit('reported-notice');
            socket.emit('system-warning', 'You reported the stranger. Finding you a new match...');

            // Disconnect both from the room instantly
            io.in(roomToClose).socketsLeave(roomToClose);
            console.log(`Room ${roomToClose} closed due to user report.`);
        }
    });

    socket.on('typing', (isTyping) => {
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('stranger-typing', isTyping);
        }
    });

    socket.on('disconnect', () => {
        totalOnline--;
        io.emit('update-user-count', totalOnline);
        waitingUsers = waitingUsers.filter(item => item.socket.id !== socket.id);
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('stranger-disconnected');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});