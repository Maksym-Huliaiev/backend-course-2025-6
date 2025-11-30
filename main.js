const { Command } = require("commander");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const path = require("path");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

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

const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Inventory API",
            version: "1.0.0",
            description: "inventory api documentation",
        },
        servers: [
            {
                url: `http://${opts.host}:${opts.port}`,
                description: "Main Server",
            },
        ],
        components: {
            schemas: {
                InventoryItem: {
                    type: "object",
                    properties: {
                        id: { type: "string", description: "Unique identifier" },
                        inventory_name: { type: "string", description: "Name of the item" },
                        description: { type: "string", description: "Item description" },
                        photo: { type: "string", format: "uri", description: "URL to the item photo" }
                    }
                }
            }
        }
    },
    apis: [__filename],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.join(opts.cache, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage });

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

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Retrieve the full inventory list
 *     tags: [Inventory]
 *     responses:
 *       200:
 *         description: A list of inventory items
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/InventoryItem'
 */
app.get('/inventory', (req, res) => {
    const inventoryWithUrls = inventory.map(item => {
        let photoUrl = null;
        if (item.photo) {
            const filename = path.basename(item.photo);
            photoUrl = `http://${opts.host}:${opts.port}/inventory/${item.id}/photo`;
        }
        return {
            ...item,
            photo: photoUrl
        };
    });
    res.json(inventoryWithUrls);
});

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Get a specific inventory item by ID
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The inventory item ID
 *     responses:
 *       200:
 *         description: The inventory item
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InventoryItem'
 *       404:
 *         description: Item not found
 */
app.get('/inventory/:id', (req, res) => {
    const { id } = req.params;
    const item = inventory.find(i => i.id === id);

    if (!item) {
        return res.status(404).send('Not found');
    }

    let photoUrl = null;
    if (item.photo) {
        const filename = path.basename(item.photo);
        photoUrl = `http://${opts.host}:${opts.port}/inventory/${item.id}/photo`;
    }

    res.json({
        ...item,
        photo: photoUrl
    });
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Get the photo of an inventory item
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The inventory item ID
 *     responses:
 *       200:
 *         description: The image file
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Photo or Item not found
 */
app.get('/inventory/:id/photo', (req, res) => {
    const { id } = req.params;
    const item = inventory.find(i => i.id === id);

    if (!item) {
        return res.status(404).send('Not found');
    }

    if (!item.photo) {
        return res.status(404).send('Not found');
    }

    if (!fs.existsSync(item.photo)) {
        return res.status(404).send('Not found');
    }

    res.header('Content-Type', 'image/jpeg');
    res.sendFile(path.resolve(item.photo));
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Update the photo for an inventory item
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Photo updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InventoryItem'
 *       400:
 *         description: Bad Request (missing photo)
 *       404:
 *         description: Item not found
 */
app.put('/inventory/:id/photo', upload.single('photo'), async (req, res) => {
    const { id } = req.params;
    const itemIndex = inventory.findIndex(i => i.id === id);

    if (itemIndex === -1) {
        return res.status(404).send('Not found');
    }

    if (!req.file) {
        return res.status(400).send('Bad Request: photo is required');
    }

    if (inventory[itemIndex].photo && fs.existsSync(inventory[itemIndex].photo)) {
        try {
            await fs.promises.unlink(inventory[itemIndex].photo);
        } catch (err) {
            console.error('Error deleting old photo:', err);
        }
    }

    inventory[itemIndex].photo = req.file.path;

    try {
        await fs.promises.writeFile(inventoryPath, JSON.stringify(inventory, null, 2));
    } catch (err) {
        console.error('Error writing inventory.json:', err);
        return res.status(500).send('Internal Server Error');
    }

    res.json({
        ...inventory[itemIndex],
        photo: `http://${opts.host}:${opts.port}/inventory/${id}/photo`
    });
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Update item details (name or description)
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Item updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InventoryItem'
 *       404:
 *         description: Item not found
 */
app.put('/inventory/:id', async (req, res) => {
    const { id } = req.params;
    const { inventory_name, description } = req.body;

    const itemIndex = inventory.findIndex(i => i.id === id);

    if (itemIndex === -1) {
        return res.status(404).send('Not found');
    }

    if (inventory_name !== undefined) {
        inventory[itemIndex].inventory_name = inventory_name;
    }
    if (description !== undefined) {
        inventory[itemIndex].description = description;
    }

    try {
        await fs.promises.writeFile(inventoryPath, JSON.stringify(inventory, null, 2));
    } catch (err) {
        console.error('Error writing inventory.json:', err);
        return res.status(500).send('Internal Server Error');
    }

    res.json(inventory[itemIndex]);
});

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Delete an inventory item
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Item deleted successfully
 *       404:
 *         description: Item not found
 */
app.delete('/inventory/:id', async (req, res) => {
    const { id } = req.params;
    const itemIndex = inventory.findIndex(i => i.id === id);

    if (itemIndex === -1) {
        return res.status(404).send('Not found');
    }

    if (inventory[itemIndex].photo && fs.existsSync(inventory[itemIndex].photo)) {
        try {
            await fs.promises.unlink(inventory[itemIndex].photo);
        } catch (err) {
            console.error('Error deleting photo:', err);
        }
    }

    inventory.splice(itemIndex, 1);

    try {
        await fs.promises.writeFile(inventoryPath, JSON.stringify(inventory, null, 2));
    } catch (err) {
        console.error('Error writing inventory.json:', err);
        return res.status(500).send('Internal Server Error');
    }

    res.status(200).send();
});

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register a new inventory item
 *     tags: [Inventory]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - inventory_name
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Device registered successfully
 *       400:
 *         description: Missing inventory_name
 */
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

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Search for an item by ID
 *     tags: [Inventory]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *               includePhoto:
 *                 type: string
 *                 description: Set to "on" to include photo URL
 *                 enum: ["on", "off"]
 *     responses:
 *       200:
 *         description: Found item
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InventoryItem'
 *       404:
 *         description: Item not found
 */
app.post('/search', (req, res) => {
    const { id, includePhoto } = req.body;

    if (!id) {
        return res.status(400).send('Bad Request: id is required');
    }

    const item = inventory.find(i => i.id === id);

    if (!item) {
        return res.status(404).send('Not found');
    }

    const result = {
        id: item.id,
        inventory_name: item.inventory_name,
        description: item.description
    };

    if (includePhoto === 'on' && item.photo) {
        result.photo = `http://${opts.host}:${opts.port}/inventory/${item.id}/photo`;
    }

    res.json(result);
});

app.get('/RegisterForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'RegisterForm.html'));
});

app.get('/SearchForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'SearchForm.html'));
});

app.use((req, res, next) => {
    return res.status(405).send('Method Not Allowed');
});

app.listen(opts.port, opts.host, () => {
    console.log(`Server running at http://${opts.host}:${opts.port}`);
    console.log(`Swagger UI available at http://${opts.host}:${opts.port}/docs`);
});
