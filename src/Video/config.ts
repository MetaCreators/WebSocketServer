import { WorkerLogLevel } from "mediasoup/node/lib/types";

export const config = {
  listenIp: '0.0.0.0',
  listenPort: 8080,
//   sslCrt: './certs/cert.pem',
//   sslKey: './certs/key.pem',
  mediasoup: {
    worker: {
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
      logLevel: 'warn'as WorkerLogLevel,
    },
    router: {
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: {
            'x-google-start-bitrate': 1000,
          },
        },
      ],
    },
    webRtcTransport: {
      listenIps: [
        { ip: '127.0.0.1', announcedIp: null },
      ],
      maxIncomingBitrate: 1500000,
      initialAvailableOutgoingBitrate: 1000000,
    },
  },
};
