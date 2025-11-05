// This file is used to check import compatibility
import express from 'express';
import cookieParser from 'cookie-parser';
import * as jwt from 'jsonwebtoken';

// Just create instances of each to verify they work
const app = express();
app.use(cookieParser());
app.use(express.json());

// Verify JWT usage
const token = jwt.sign({ test: 'data' }, 'secret');
jwt.decode(token);

console.log('Imports check successful');
