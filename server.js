require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const twilio = require('twilio');
const notifier = require('node-notifier'); 
const sound = require('sound-play'); 
const open = require('open'); 

const app = express();
const port = 3000;

const ALARM_PATH = path.join(__dirname, 'public', 'alarm.mp3');

//  CONFIGURATION 
const client = new twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const twilioPhoneNumber = process.env.TWILIO_PHONE;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect(err => {
    if(err) console.error("❌ DB Error: ", err);
    else console.log("✅ MySQL Connected");
});

//  API ROUTES 
app.get('/api/notes', (req, res) => {
    db.query("SELECT * FROM notes ORDER BY created_at DESC", (err, results) => {
        if(err) return res.status(500).json(err);
        res.json(results);
    });
});

app.post('/api/notes', upload.single('document'), (req, res) => {
    const { title, content, color, repeat_count } = req.body;
    const filePath = req.file ? req.file.path : null;
    const fileName = req.file ? req.file.originalname : null;
    const rings = repeat_count || 1;

    const sql = "INSERT INTO notes (title, content, color, file_path, file_original_name, repeat_count) VALUES (?, ?, ?, ?, ?, ?)";
    db.query(sql, [title, content, color, filePath, fileName, rings], (err, result) => {
        if(err) return res.status(500).json(err);
        res.json({ message: "Saved" });
    });
});

app.put('/api/notes/:id', (req, res) => {
    const { title, content, color, reminder_time, repeat_count } = req.body;
    let sql, params;

    if(reminder_time) {
        const formattedTime = reminder_time.slice(0, 19).replace('T', ' ');
        const rings = repeat_count || 1;
        
        sql = "UPDATE notes SET reminder_time=?, sms_sent=0, repeat_count=? WHERE id=?";
        params = [formattedTime, rings, req.params.id];
    } else if (title || content) {
        sql = "UPDATE notes SET title=?, content=?, color=? WHERE id=?";
        params = [title, content, color, req.params.id];
    } else if (color) {
        sql = "UPDATE notes SET color=? WHERE id=?";
        params = [color, req.params.id];
    }

    db.query(sql, params, (err, result) => {
        if(err) {
            console.error("SQL Error:", err); 
            return res.status(500).json(err);
        }
        res.json({ message: "Updated" });
    });
});

app.delete('/api/notes/:id', (req, res) => {
    db.query("DELETE FROM notes WHERE id=?", [req.params.id], (err, result) => {
        if(err) return res.status(500).json(err);
        res.json({ message: "Deleted" });
    });
});

   //AUDIO PLAYER 
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function playServerAlarm(rings) {
    console.log(`🔊 Playing System Alarm ${rings} times...`);
    for (let i = 0; i < rings; i++) {
        try {
            await sound.play(ALARM_PATH); 
            await sleep(1000); 
        } catch (error) {
            console.error("Audio Error:", error);
        }
    }
}

// BACKGROUND JOB
setInterval(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    const currentTimeString = `${year}-${month}-${day} ${hours}:${minutes}:00`;

    const sql = `SELECT * FROM notes WHERE reminder_time = ?`;

    db.query(sql, [currentTimeString], (err, rows) => {
        if (err) return console.error(err);

        rows.forEach((note) => {
            console.log(`⏰ Time Up: ${note.title}`);

            // 1. Play Audio
            const rings = note.repeat_count || 1;
            playServerAlarm(rings);

            // 2. Notification with CLICK REDIRECT
            notifier.notify({
                title: '🔔 Chronicle Alarm',
                message: `Click to open: ${note.title}`,
                wait: true, 
                sound: false 
            }, 
            function(err, response, metadata) {
                if (response === 'activate') {
                    console.log("🚀 User clicked notification! Opening browser...");
                    open('http://localhost:3000');
                }
            });

            // 3. Send SMS
            if (note.phone && note.sms_sent === 0) {
                client.messages.create({
                    body: `REMINDER: ${note.title}`,
                    from: twilioPhoneNumber,
                    to: note.phone
                })
                .then(() => {
                    db.query("UPDATE notes SET sms_sent = 1 WHERE id = ?", [note.id]);
                })
                .catch(e => console.error("SMS Failed"));
             }
        });
    });
}, 60000); 

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));