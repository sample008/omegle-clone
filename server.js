const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Tell the server to look at our folder to show the website
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// This queue holds users who are waiting for a match
let waitingUsers = [];

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 1. When a user clicks "Next Stranger"
    socket.on('find-match', () => {
        // If the user was already chatting, make sure they leave their previous room
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('stranger-disconnected');
            socket.leave(socket.currentRoom);
            socket.currentRoom = null;
        }

        // Check if someone else is waiting in the queue
        if (waitingUsers.length > 0) {
            // Grab the waiting stranger
            const strangerSocket = waitingUsers.shift();

            // Create a unique room name for both of them
            const roomName = `room-${socket.id}-${strangerSocket.id}`;

            // Put both users into the same room
            socket.join(roomName);
            strangerSocket.join(roomName);

            // Remember what room they are in
            socket.currentRoom = roomName;
            strangerSocket.currentRoom = roomName;

            // Tell both users they are successfully matched!
            io.to(roomName).emit('matched');
            console.log(`Matched! Created: ${roomName}`);
        } else {
            // Nobody is waiting, so put this user in the queue
            waitingUsers.push(socket);
            socket.emit('waiting');
            console.log(`User ${socket.id} added to the waiting queue.`);
        }
    });

    // 2. When a user sends a text message
    socket.on('send-message', (text) => {
        if (socket.currentRoom) {
            // Send the message to the OTHER person in the room
            socket.to(socket.currentRoom).emit('receive-message', text);
        }
    });

    // 3. When a user closes their browser or tab
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Remove them from the waiting list if they were in it
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
        
        // Notify their partner if they were in a chat
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('stranger-disconnected');
        }
    });
});

// Start the server on port 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running perfectly on port ${PORT}`);
});