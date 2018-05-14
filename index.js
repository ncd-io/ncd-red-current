const events = require("events");
module.exports = class CurrentMonitor{
	constructor(addr, comm, config){
		this.addr = addr;
		this.comm = comm;
		this._emitter = new events.EventEmitter();
		this.ready = false;
		this.initialized = false;
		this.init();
	}
	on(e, cb){
		this._emitter.on(e, cb);
		if(this.ready) cb(this);
	}
	send(...data){
		var command = [146, 106];
		while(data.length < 5){
			data.push(0);
		}
		command.push(...data);
		command.push(command.reduce((h,v) => h+v) & 255);
		command.unshift(this.addr);
		return this.comm.writeBytes(...command);
	}
	read(...command){
		var sensor = this;
		var length = command.pop();
		return new Promise((fulfill, reject) => {
			sensor.send(...command).then(() => {
				sensor.comm.readBytes(sensor.addr, length+1).then((r) => {
					var checksum = r.pop();
					if((r.reduce((h, v) => h+v) & 255) != checksum){
						reject('Bad checksum');
					}else{
						fulfill(r);
					}
					sensor.initialized = true;
				}).catch((err) => {
					console.log({read_failed: command});
					sensor.initialized = false;
					reject(err);
				})
			}).catch((err) => {
				console.log({send_failed: command});
				sensor.initialized = false;
				reject(err);
			})
		});
	}

	init(){
		var sensor = this;
		this.read(2, 6).then((res) => {
			sensor.cs_type = res[0];
			sensor.max_current = res[1];
			sensor.channels = res[2];
			sensor.firmware = res[3];
			this.initialized = true;
			sensor._emitter.emit('ready', sensor);
			sensor.ready = true;
		}).catch((err) => {
			console.log(err);
			this.initialized = false;
		});
	}
	getCalibration(start_channel, stop_channel){
		if(!stop_channel) stop_channel = start_channel;
		return new Promise((fulfill, reject) => {
			var channels = stop_channel-start_channel;
			this.read(3, start_channel, stop_channel, channels * 2).then((r) => {
				var res = [];
				for(var i=0;i<channels;i++){
					res[i] = (r[i*2] << 8) + r[i*2+1];
				}
				fulfill(res);
				this.initialized = true;
			}).catch((err) => {
				this.initialized = false;
				reject(err);
			})
		})
	}
	setCalibration(val, start_channel, stop_channel){
		if(!stop_channel) stop_channel = start_channel;
		return this.send(4, start_channel, stop_channel, val >> 8, val & 255);
	}
	get(start_channel, stop_channel){
		if(!stop_channel) stop_channel = start_channel;
		return new Promise((fulfill, reject) => {
			var channels = (stop_channel-start_channel)+1;
			this.read(1, start_channel, stop_channel, channels * 3).then((r) => {
				var res = {};
				for(var i=0;i<channels;i++){
					res['channel_'+(start_channel+i)] = (r[i*3] << 16) + (r[i*3+1] << 8) + r[i*3+2];
				}
				fulfill(res);
				this.initialized = true;
			}).catch((err) => {
				this.initialized = false;
				reject(err);
			})
		})
	}
}
