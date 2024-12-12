import express from 'express'
import { WebSocketServer } from 'ws'
import { User } from './types/Usertypes'
import { broadcastChatMessage, broadcastUserList, broadcastUserMove } from './helperfns/Sockets'
import { CreateNewUser } from './helperfns/UserRelated/CreateNewUser'

const app = express()
const httpServer = app.listen(8080, () => {
    console.log("websocket server started on port 8080")
})

const wss = new WebSocketServer({ server: httpServer });
//TODO: BUG: Probably,during race conditions, 2 browsers get the same userid,hence causing some bugs,,,or maybe there's issue with allotting the same websocket session to all users
//BUG2: "User is near" message isnt transmitted to all clients 
let connectedUsers: Map<number, User> = new Map();

wss.on('connection', function connection(ws) {

  const userId = CreateNewUser(connectedUsers,ws)

  ws.send(JSON.stringify({ 
    type: 'userId', 
    id: userId 
  }));

  broadcastUserList(connectedUsers,wss);

  ws.on('message', function message(data) {
    try {
      const parsedMessage = JSON.parse(data.toString());

      switch (parsedMessage.type) {
        case 'move':
          const user = connectedUsers.get(userId);
          if (user) {
            user.position = parsedMessage.position;
            broadcastUserMove(userId, user.position,wss);
          }
          break;
        
        case 'chat':
          broadcastChatMessage(userId, parsedMessage.message,wss);
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', function close() {
    connectedUsers.delete(userId);
    broadcastUserList(connectedUsers,wss);
  });
});
