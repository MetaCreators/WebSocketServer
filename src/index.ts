import express from 'express'
import {WebSocket, WebSocketServer } from 'ws'
import { User } from './types/Usertypes'
import { broadcastChatMessage, broadcastUserList, broadcastUserMove } from './helperfns/Sockets'
import { CreateNewUser } from './helperfns/UserRelated/CreateNewUser'
import checkProximity from './helperfns/ProximityCheck/checkProximity'
//import http from 'http';
import https from 'httpolyglot';
import { createServer } from 'http'
import { config } from './Video/config';
import { Server } from 'socket.io';
import * as mediasoup from 'mediasoup';
import cors from 'cors';
import fs from 'fs'


// Mediasoup-related variables
// let worker: any;
// let producer: any;
// let consumer: any;
// let producerTransport: any;
// let consumerTransport: any;
// let mediasoupRouter: any;

// const options = {
//   key:fs.readFileSync('./src/ssl/key.pem','utf-8'),
//   cert:fs.readFileSync('./src/ssl/cert.pem','utf-8')
// }


const app = express();
app.use(cors());

app.get('/', (req,res) => {
  res.send('hello from lithouse Backend')
})
//const httpsServer = https.createServer(options, app);
const httpsServer = createServer(app);

const wss = new WebSocketServer({ server: httpsServer, path: '/chat' });
const io = new Server(httpsServer, {
   cors: {
    origin: "http://localhost:5173",
     methods: ["GET", "POST"],
    credentials:true
  },
  //transports: ['websocket', 'polling']
   
});
//const peers = io.of('/mediasoup')

io.on('connection', (socket) => {
  console.log("user connected with id " + socket.id);
  socket.broadcast.emit("new-user","new user joined with id "+socket.id)
  socket.on('connect_error', (error) => {
    console.log('Connection error:', error);
  });

  socket.emit('connection-success', {
    socketId:socket.id
  })
  socket.emit("hello","welcome to server")
  socket.on('disconnect', () => {
      console.log('A user disconnected with userid '+socket.id);
  });
})

let connectedUsers: Map<number, User> = new Map();

io.listen(4000);

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
          //proximity check here
          //TODO: We are calculating proximity at every move => results in too many computations => what's a better way to do it ?
          //TODO: Will this approach result in a lag? =>probably yes
          //TODO: BUG: When >2 users => proximity message stops working properly=>doesnt clear away + doesnt showup on some client
          let nearbyUsers = checkProximity(connectedUsers)
          if (nearbyUsers) {
            Object.entries(nearbyUsers).forEach(([userId, nearbyUserIds]) => {
              const currentUser = connectedUsers.get(Number(userId));
              if (currentUser) {
                wss.clients.forEach((client) => {
                  if (client === currentUser.ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                      type: "proximity",
                      nearbyUsers: nearbyUserIds,
                      currentUserId:currentUser.id
                   }))
                 }
               })
              }
            });
          } else {
            connectedUsers.forEach((user, userId) => {
              wss.clients.forEach((client) => {
                  if (client===user.ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                      type: "proximity",
                      nearbyUsers: null,
                      currentUserId:userId
                   }))
                 }
              })
            }) 
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

httpsServer.listen(8080, () => {
  console.log('Server is running on http://localhost:8080');
});


//why worker is needed?
// async function runMediasoupWorker() {
//   try {
//     console.log('Attempting to create Mediasoup worker');
//     worker = await mediasoup.createWorker({
//       logLevel: config.mediasoup.worker.logLevel as mediasoup.types.WorkerLogLevel,
//       rtcMinPort: config.mediasoup.worker.rtcMinPort,
//       rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
//     });

//     console.log('Mediasoup worker created successfully');

//     worker.on('died', () => {
//       console.error('Mediasoup worker died, exiting...');
//       process.exit(1);
//     });

//     mediasoupRouter = await worker.createRouter({
//       mediaCodecs: config.mediasoup.router.mediaCodecs,
//     });
//   } catch (error) {
//     console.error('Error creating Mediasoup worker:', error);
//     throw error;
//   }
// }

// async function createWebRtcTransport() {
//   const { maxIncomingBitrate, initialAvailableOutgoingBitrate } = config.mediasoup.webRtcTransport;
//   const transport = await mediasoupRouter.createWebRtcTransport({
//     listenIps: config.mediasoup.webRtcTransport.listenIps,
//     enableUdp: true,
//     enableTcp: true,
//     preferUdp: true,
//     initialAvailableOutgoingBitrate,
//   });

//   if (maxIncomingBitrate) {
//     await transport.setMaxIncomingBitrate(maxIncomingBitrate);
//   }

//   return {
//     transport,
//     params: {
//       id: transport.id,
//       iceParameters: transport.iceParameters,
//       iceCandidates: transport.iceCandidates,
//       dtlsParameters: transport.dtlsParameters,
//     },
//   };
// }


// io.on('connection', (socket) => {
//   console.log('Video client connected');

//   if (producer) {
//     socket.emit('newProducer');
//   }

//   socket.on('disconnect', () => {
//     console.log('Video client disconnected');
//   });

//   socket.on('getRouterRtpCapabilities', (data, callback) => {
//     callback(mediasoupRouter.rtpCapabilities);
//   });

//   socket.on('createProducerTransport', async (_, callback) => {
//     try {
//       const { transport, params } = await createWebRtcTransport();
//       producerTransport = transport;
//       callback(params);
//     } catch (err:any) {
//       console.error(err);
//       callback({ error: err.message });
//     }
//   });

//   socket.on('createConsumerTransport', async (_, callback) => {
//     try {
//       const { transport, params } = await createWebRtcTransport();
//       consumerTransport = transport;
//       callback(params);
//     } catch (err:any) {
//       console.error(err);
//       callback({ error: err.message });
//     }
//   });

//   socket.on('connectProducerTransport', async (data, callback) => {
//     await producerTransport.connect({ dtlsParameters: data.dtlsParameters });
//     callback();
//   });

//   socket.on('connectConsumerTransport', async (data, callback) => {
//     await consumerTransport.connect({ dtlsParameters: data.dtlsParameters });
//     callback();
//   });

//   socket.on('produce', async (data, callback) => {
//     const { kind, rtpParameters } = data;
//     producer = await producerTransport.produce({ kind, rtpParameters });
//     callback({ id: producer.id });

//     socket.broadcast.emit('newProducer');
//   });

//   socket.on('consume', async (data, callback) => {
//     try {
//       if (!producer) {
//         callback({ error: 'No active producer' });
//         return;
//       }
//       if (!mediasoupRouter.canConsume({ producerId: producer.id, rtpCapabilities: data.rtpCapabilities })) {
//         callback({ error: 'Cannot consume' });
//         return;
//       }
//       consumer = await consumerTransport.consume({
//         producerId: producer.id,
//         rtpCapabilities: data.rtpCapabilities,
//         paused: producer.kind === 'video',
//       });

//       callback({
//         producerId: producer.id,
//         id: consumer.id,
//         kind: consumer.kind,
//         rtpParameters: consumer.rtpParameters,
//         type: consumer.type,
//       });
      
//     } catch (error:any) {
//       console.error('Consume error:', error);
//       callback({ error: error.message });
//     }
//   });

//   socket.on('resume', async (_, callback) => {
//     await consumer.resume();
//     callback();
//   });
// });


// // Start the application
// (async () => {
//   await runMediasoupWorker();
// })();
