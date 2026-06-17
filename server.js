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

// Upgraded queue: now an array of objects containing user data
let waitingUsers = [];
let totalOnline = 0;

io.on('connection', (socket) => {
    totalOnline++;
    // Broadcast updated user count to EVERYONE online
    io.emit('update-user-count', totalOnline);
    console.log('A user connected. Total online:', totalOnline);

    // 1. Matchmaking with Interests
    socket.on('find-match', (interestsString) => {
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('stranger-disconnected');
            socket.leave(socket.currentRoom);
            socket.currentRoom = null;
        }

        // Clean up user tags into an array of lowercase words
        const userInterests = interestsString
            ? interestsString.toLowerCase().split(',').map(i => i.trim()).filter(i => i !== "")
            : [];

        // Look for a match in the waiting list
        let matchIndex = -1;

        if (userInterests.length > 0) {
            // Try to find someone who shares AT LEAST ONE interest
            matchIndex = waitingUsers.findIndex(stranger => {
                return stranger.interests.some(interest => userInterests.includes(interest));
            });
        }

        // If no interest match was found, grab the first available person (random match)
        if (matchIndex === -1 && waitingUsers.length > 0) {
            matchIndex = 0;
        }

        if (matchIndex !== -1) {
            // Remove matched stranger from queue
            const strangerData = waitingUsers.splice(matchIndex, 1)[0];
            const strangerSocket = strangerData.socket;

            const roomName = `room-${socket.id}-${strangerSocket.id}`;
            socket.join(roomName);
            strangerSocket.join(roomName);

            socket.currentRoom = roomName;
            strangerSocket.currentRoom = roomName;

            io.to(roomName).emit('matched');
        } else {
            // No match found, push user to queue with their interests
            waitingUsers.push({
                socket: socket,
                interests: userInterests
            });
            socket.emit('waiting');
        }
    });

    // 2. Typing Indicators
    socket.on('typing', (isTyping) => {
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('stranger-typing', isTyping);
        }
    });

    // 3. Message Passing
    socket.on('send-message', (text) => {
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('receive-message', text);
        }
    });

    // 4. Disconnect Handlers
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