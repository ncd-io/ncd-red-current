"use strict";

const CurrentMonitor = require("./index.js");
const comms = require("ncd-red-comm");

process.on('unhandledRejection', error => {
  console.log('unhandledRejection', error);
});


module.exports = function(RED){
	var sensor_pool = {};
	var loaded = [];

	//ensureDependencies(['node-red-contrib-aws', 'fail']);

	function NcdI2cDeviceNode(config){
		RED.nodes.createNode(this, config);
		this.interval = parseInt(config.interval);
		this.addr = parseInt(config.addr);
		if(typeof sensor_pool[this.id] != 'undefined'){
			//Redeployment
			clearTimeout(sensor_pool[this.id].timeout);
			delete(sensor_pool[this.id]);
		}
		this.sensor = new CurrentMonitor(this.addr, RED.nodes.getNode(config.connection).i2c);
		sensor_pool[this.id] = {
			sensor: this.sensor,
			polling: false,
			timeout: 0,
			node: this
		}
		var node = this;
		var status = "{}";
		var last_status = false;

		function device_status(){
			if(!node.sensor.initialized){
				node.status({fill:"red",shape:"ring",text:"disconnected"});
				return false;
			}
			node.status({fill:"green",shape:"dot",text:"connected"});
			return true;
		}

		function start_poll(force){
			if(node.interval && !sensor_pool[node.id].polling){
				stop_poll();
				sensor_pool[node.id].polling = true;
				get_status(true, force);
			}
		}

		function stop_poll(){
			clearTimeout(sensor_pool[node.id].timeout);
			sensor_pool[node.id].polling = false;
		}

		function send_payload(_status, force){
			if(!force && node.onchange && JSON.stringify(_status) == status) return;
			var msg = [],
				dev_status = {topic: 'device_status', payload: _status};
			if(config.output_all){
				var old_status = JSON.parse(status);
				for(var i in _status){
					if(!force && node.onchange && _status[i] == old_status[i]){
						msg.push(null);
					}else msg.push({topic: i, payload: _status[i]})
				}
				msg.push(dev_status);
			}else{
				msg = dev_status;
			}
			if(!config.send_init && status == "{}"){
				status = JSON.stringify(_status);
			}else{
				status = JSON.stringify(_status);
				node.send(msg);
			}
		}

		function get_status(repeat, force){
			if(repeat) clearTimeout(sensor_pool[node.id].timeout);
			if(device_status(node)){
				if(!last_status){
					last_status = true;
				}
				node.sensor.get(1, config.channels).then((res) => {
					send_payload(res, force);
				}).catch((err) => {
					node.send({error: err});
				}).then(() => {
					if(repeat && node.interval){
						clearTimeout(sensor_pool[node.id].timeout);
						sensor_pool[node.id].timeout = setTimeout(() => {
							if(typeof sensor_pool[node.id] != 'undefined'){
								get_status(true);
							}
						}, node.interval);
					}else{
						sensor_pool[node.id].polling = false;
					}
				});
			}else{
				last_status = false;
				clearTimeout(sensor_pool[node.id].timeout);
				node.sensor.init();
				sensor_pool[node.id].timeout = setTimeout(() => {
					if(typeof sensor_pool[node.id] != 'undefined'){
						get_status(true);
					}
				}, 3000);
			}
		}

		node.on('input', (msg) => {
			stop_poll();
			if(msg.topic != 'get_status'){
				if(typeof node.sensor.settable != 'undefined' && node.sensor.settable.indexOf(msg.topic) > -1){
					node.sensor.set(msg.topic, msg.payload).then((_status) => {
						if(config.persist) node.settings.last_state = node.sensor.output_status;
					}).catch().then(() => {
						start_poll()
					});
				}
			}else{
				start_poll(true);
			}
		});

		node.on('close', (removed, done) => {
			if(removed){
				clearTimeout(sensor_pool[node.id].timeout);
				delete(sensor_pool[node.id]);
			}
			done();
		});
		this.sensor.once('ready', (sensor) => {
			config.max_current = sensor.max_current;
			config.channels = sensor.channels;
			start_poll();
			device_status(node);
		});
	}
	RED.nodes.registerType("ncd-current_monitor", NcdI2cDeviceNode)
	RED.httpAdmin.post("/ncd/current_monitor/config/:addr", RED.auth.needsPermission('serial.read'), function(req,res) {
		var i2c,
			config;
		console.log(req.body);
		if(config = RED.nodes.getNode(req.body.id)){

			i2c = config.i2c;
			console.log('using existing connection');
		}else{
			switch(req.body.commType){
				case 'standard':
					var port = parseInt(req.body.bus.split('-')[1]);
					i2c = new comms.NcdI2C(port);
					break;
				case 'ncd-usb':
					var comm = new comms.NcdSerial(req.body.bus, 115200);
					i2c = new comms.NcdSerialI2C(comm, parseInt(req.body.addr));
					break;
			}
			if(req.body.useMux){
				i2c = new comms.NcdMux(parseInt(req.body.muxAddr), parseInt(req.body.muxPort), i2c);
			}
		}
		//if(typeof sensor_pool[this.id] != 'undefined'){
			var sensor = new CurrentMonitor(parseInt(req.params.addr), i2c);
		//}
		sensor.on('ready', (sensor) => {
			res.json(sensor);
		});
		//get i2c connection
		//create device
		//get/return status
	});
}
