var comms = require('ncd-red-comm');
var CurrentMonitor = require('./index.js');

var port = '/dev/tty.usbserial-DN0302PM';
var serial = new comms.NcdSerial('/dev/tty.usbserial-DN0302PM', 115200);
var comm = new comms.NcdSerialI2C(serial, 0);

var sensor = new CurrentMonitor(42, comm);

sensor.on('ready', () => {
	console.log(sensor);

	setTimeout(() => {
		sensor.get(1, 9).then(console.log).catch(console.log);
	}, 30);

});
