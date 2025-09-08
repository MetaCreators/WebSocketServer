declare module 'httpolyglot' {
  import { Server, ServerOptions } from 'https';
  import { Application } from 'express';

  interface HttpPolygloOptions extends ServerOptions {
    key: string | Buffer;
    cert: string | Buffer;
  }

  function createServer(options: HttpPolygloOptions, app: Application): Server;

  export = {
    createServer: createServer
  };
}