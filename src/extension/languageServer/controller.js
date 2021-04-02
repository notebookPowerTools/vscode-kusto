const { Worker } = require('worker_threads');
const path = require('path');

const worker = new Worker(path.join(__dirname, 'worker.js'), { workerData: 'startup' });
worker.on('message', (msg) => {
    // console.log(`From Worker ${msg}`);
    // console.log(msg);
    if (msg === 'init') {
        console.log('Started');
        worker.postMessage({ one: 1234 });
        worker.postMessage({ command: 'doComplete', text: 'K', position: { line: 1, character: 1 }, requestId: '1' });
        worker.postMessage('Hello2');
        return;
    }
    if (typeof msg === 'object' && msg) {
        if (msg.completions) {
            console.log(msg);
        }
    } else {
        console.log(msg);
    }
});
worker.on('error', console.error);
worker.on('exit', (code) => {
    console.error(`Exit ${code}`);
});
