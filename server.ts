// importa os métodos necessários
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { Server, Socket } from 'net';
import { sep } from 'path';

// define a porta
const port: number = 11550;

class PTAServer extends Server {

    // define a lista de arquivos e o estado do servidor
    private files: Array<string> = [];
    private ready: boolean = false;
    private serverRoot: Array<string> = ['.', 'pta-server'];
    private users: Array<string> = [];
    
    constructor(listener?: ((socket: Socket) => void)) { 
        super(listener);
        this.updateFiles();
        this.updateUsers();
     }

    /**
     * Alterna o estado da FSM
     */
    toggleState(): void {
        if (this.ready) {
            this.ready = false;
        } else {
            this.ready = true;
        }
    }

    // Getters
    getFiles(): Array<string> {
        this.updateFiles();
        return this.files;
    }

    isReady(): boolean {
        return this.ready;
    }

    private getFilesPath(): string {
        let filesPath = this.serverRoot.slice();
        filesPath.push('files');
        return filesPath.join(sep); // ./pta-server/files
    }

    /**
     * Update the users variable
     */
    updateUsers(): void {
        let usersFilePathArray = this.serverRoot.slice();
        usersFilePathArray.push('users.txt');
        let usersFile = usersFilePathArray.join(sep); // ./pta-server/users.txt
        this.users = readFileSync(usersFile, {encoding: 'utf8'}).split('\n');
    }

    /**
     * Update the files variable
     */
    updateFiles(): void {
        let filesPath = this.getFilesPath();
        this.files = readdirSync(filesPath, {encoding: 'utf8'});
    }

    /**
     * Verify if the user have permission to access the files
     */
    verifyUser(user: string): boolean {
        this.updateUsers();
        return this.users.some((value) => {
            return value === user;
        });
    }

    getFile(filename: string) {
        let file = this.getFilesPath() + sep + filename;
        if (existsSync(file)) {
            let bytes = statSync(file).size;
            let content = readFileSync(file, {encoding: 'utf8', flag: 'r'});
            return bytes + ' ' + content;
        }
        return undefined;
    }

    /**
     * retorna a data e hora atual
     */
    now(): string {
        let date = new Date();
        let dateArray: any = date.toLocaleDateString().split('-');
        dateArray = dateArray.reverse().join('/');
        return dateArray + ' ' + date.toLocaleTimeString();
    }

}

// declara a função respond
var respond: ((reply: string, args?: string) => void);

const pta = new PTAServer((connection: Socket) => {
    console.log(pta.now() + ' - Client connected [' + connection.remoteAddress + ':' + connection.remotePort + ']');

    connection.on('data', (data: Buffer) => {
        var message = data.toString().split(' ');
        var seq_num = message[0];
        var command = message[1];

        // função para responder ao cliente
        respond = (reply: string, args?: string): void => {
            if (args) {
                connection.write(seq_num + ' ' + reply + ' ' + args);
            } else {
                connection.write(seq_num + ' ' + reply);
            }
        }

        if (pta.isReady()) {
            switch (command) {
                case 'TERM':
                    if (message.length > 2) {
                        respond('NOK');
                    } else {
                        respond('OK');
                        connection.end();
                        pta.toggleState();
                    }
                    break;
                case 'PEGA':
                    if (message.length > 2) {
                        let args = message[2];
                        let response = pta.getFile(args);
                        if (response) {
                            respond('ARQ', response);
                        } else {
                            respond('NOK');
                        }
                    } else {
                        respond('NOK');
                    }
                    break;
                case 'LIST':
                    if (message.length > 2) {
                        respond('NOK');
                    } else {
                        let files = pta.getFiles();
                        respond('ARQS', files.length + ' ' + files.toString());
                    }
                    break;
                default:
                    respond('NOK');
                    break;
            }
        } else {
            switch (command) {
                case 'CUMP':
                    if (message.length > 2) {
                        let args = message[2];
                        let allowed = pta.verifyUser(args);
                        if (allowed) {
                            respond('OK');
                            pta.toggleState();
                            break;
                        }
                    }       
                default:
                    respond('NOK');
                    connection.end();
                    break;
            }
        }

    });

    connection.on('close', () => {
        if (pta.isReady()) {
            pta.toggleState();
        }
        console.log(pta.now() + ' - Client disconnected [' + connection.remoteAddress + ':' + connection.remotePort + ']');
    });

});

// começa a escutar as requisições
pta.listen(port);
console.log('Process ' + process.pid + ' running on ' + process.platform);
console.log('Listening on port 11550...\n');