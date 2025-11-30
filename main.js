const { Command } = require("commander");
const fs = require("fs");
const http = require("http");

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

const server = http.createServer(async (req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Hello, World!\n");
});

server.listen(opts.port, opts.host, () => {
    console.log(`Server running at http://${opts.host}:${opts.port}`);
});