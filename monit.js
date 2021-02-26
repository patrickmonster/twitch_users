const tmi = require('tmi.js');
const config = require("./js/config");
const { live_monit_users, Op } = require('./models');

const client = new tmi.Client({
	connection: {
		reconnect: true,
		secure: true
	},
	identity: {
		username: 'user',
		password: 'key'
	},
	channels: []
});

const join_users_name = [];

async function bootJoinUser(){
	let query = {where:{[Op.not]:{login:{[Op.in]:join_users_name}}}};
	if(!join_users_name.length){
		query = {};
	}
	try{
		const join_user = await live_monit_users.findAll(query);

		for (let i in join_user){
			join_users_name.push(join_user[i].login);
			client.ws.send(`JOIN #${join_user[i].login}`);
		}

		if(!join_users_name.length || join_users_name.length == join_user.length){
			console.log(`사용자 ${join_user.length} 명`);
			return;
		}

	  const part_user = await live_monit_users.findAll({
			where:{
				[Op.not]:{
					login:{
						[Op.in]:join_users_name
					}
				}
			}
		});

		for (let i in part_user){
			let index = join_users_name[i].indexOf(part_user[i].login);
			join_users_name.splice(index, 1);
			client.ws.send(`PART #${part_user[i].login}`);
		}

		console.log(`사용자 Join: ${join_user.length}/ Part :${part_user.length} | All :${join_users_name.length}`);
	}catch (e){
		console.log(e);
	}
}

setInterval(bootJoinUser,config.LIVE_UPDATE_TIME);

function addUser(login,channel){
	if(login[0]=='#')
		login = login.substring(1);
	if(channel[0]=='#')
		channel = channel.substring(1);
	if(join_users_name.indexOf(login)==-1)
		live_monit_users.findOrCreate({
			where: {
				login: login
			},
			defaults: {parent: channel}
		}).then(()=>{}).catch(console.error);
}

client.on('connected', bootJoinUser);

client.on('join', (channel, message, self) => {
	if(message=="recodingbot") return;
	console.info(`${channel} :${message}`);
	addUser(message,channel);
});

client.on('chat', (channel, tags, message, self) => {
	if(self || tags.username=="recodingbot") return;
	addUser(tags.username,channel);
});
client.connect().catch(console.error);
