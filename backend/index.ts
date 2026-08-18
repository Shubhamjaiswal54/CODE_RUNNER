import express, { type Request, type Response, urlencoded } from "express";
import cors from "cors";
import fs from "fs";
import { createClient } from 'redis';
import {prisma} from "./lib/prisma.ts"



const app = express();
const client = createClient();
await client.connect();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.get('/', (req: Request, res: Response): void => {
    res.send("<h1>hello there</h1>");
});

app.post("/", async (req: Request, res: Response) => {
    const lang = req.body.lang;
    const code = req.body.code;

    const obj = {
        lang: req.body.lang,
        code: req.body.code,
        status : "Processing"
    }

    const response = await prisma.submission.create({
        data : {
            lang,
            code,
            status : "Processing"   
        },

    })

    await client.rPush("submission", JSON.stringify(response));
    res.send({message : "processing" , submissionId : response.id});
});

app.get("/submission/:submissionId", async (req, res) => {
    try {
        const response = await prisma.submission.findFirst({
        where: {
            id: req.params.submissionId
        }
    })

    res.json({
        submission: response
    })
    
    } catch (error) {
        res.json(error)   ;
    }
    
})


app.listen(5000, () => console.log("app is listening on the port 5000"));
