import express from 'express';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.js';
const app=createApi();
app.use(express.static(fileURLToPath(new URL('../dist',import.meta.url))));
const port=Number(process.env.ARENA_PORT??5173);
app.listen(port,'127.0.0.1',()=>console.log(`金融 Agent：http://127.0.0.1:${port}`));
