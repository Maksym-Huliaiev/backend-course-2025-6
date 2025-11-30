const { Command } = require("commander");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const path = require("path");

const program = new Command();

program
    .requiredOption("-h, --host <host>", "адреса сервера")
    .requiredOption("-p, --port <port>", "порт сервера")
    .requiredOption("-c, --cache <path>", "шлях до директорії для кешування");

program.parse(process.argv);
const opts = program.opts();

console.log(opts);

if (!fs.existsSync(opts.cache)) {
    fs.mkdirSync(opts.cache);
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.join(opts.cache, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

const inventoryPath = path.join(opts.cache, 'inventory.json');
let inventory = [];

try {
    if (fs.existsSync(inventoryPath)) {
        const data = fs.readFileSync(inventoryPath, 'utf8');
        inventory = JSON.parse(data);
    }
} catch (err) {
    console.error('Error reading inventory.json:', err);
}

app.post('/register', upload.single('photo'), async (req, res) => {
    const { inventory_name, description } = req.body;

    if (!inventory_name) {
        return res.status(400).send('Bad Request: inventory_name is required');
    }

    const newItem = {
        id: Date.now().toString(),
        inventory_name,
        description,
        photo: req.file?.path,
    };

    inventory.push(newItem);

    try {
        await fs.promises.writeFile(inventoryPath, JSON.stringify(inventory, null, 2));
    } catch (err) {
        console.error('Error writing inventory.json:', err);
        return res.status(500).send('Internal Server Error');
    }

    res.status(201).send('Device registered successfully');
});

app.get('/', (req, res) => {
    res.send("Hello, World!\n");
});

app.listen(opts.port, opts.host, () => {
    console.log(`Server running at http://${opts.host}:${opts.port}`);
});