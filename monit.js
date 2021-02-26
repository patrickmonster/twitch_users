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

let func_call;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const isNull = val => val === null;
let count = 0;
let isRun = 0
async function bootJoinUser(){
	if(isRun)return;
	isRun = 1;
	let query = {where:{[Op.not]:{login:{[Op.in]:join_users_name}}}};
	if(!join_users_name.length){
		query = {};
	}
	try{
		const join_user = await live_monit_users.findAll(query);

		for (let i in join_user){
			if(count==20){
				await sleep(1000 * 3);
				console.info(`추가 대기...${i}/${join_user.length}\t\t${join_users_name.length}`);
				count=0;
			}else{
				count+=1;
			}
			if(!isNull(client.ws.send)){
				client.ws.send(`JOIN #${join_user[i].login}`);
				join_users_name.push(join_user[i].login);
			}else {
				console.log(`사용자 추가에 실패함! ${join_user[i].login}`);
				await sleep(500);//.5초 대기 (재연결)
			}
		}
		console.log(`사용자 Join: ${join_user.length}/ All :${join_users_name.length}`);
	}catch (e){
		console.log(e);
	}
	isRun = 0;
}

function init(){
	if(client.ws && !isNull(client.ws.send)){
		console.log("모니터링 시작");
		bootJoinUser();
		setInterval(bootJoinUser,config.LIVE_UPDATE_TIME);
	}else setTimeout(init, 1000 * 10);
}
init();

function addUser(login,channel){
	if(login[0]=='#')
		login = login.substring(1);
	if(channel[0]=='#')
		channel = channel.substring(1);
	live_monit_users.findOrCreate({
		where: {login: login, parent: channel}
	}).then().catch(console.error);
}

client.on('connected', (msg)=>{
	console.log(msg);
});

client.on('join', (channel, message, self) => {
	if(message=="recodingbot") return;
	addUser(message,channel);
});
client.on('chat', (channel, tags, message, self) => {
	if(self || tags.username=="recodingbot") return;
	addUser(tags.username,channel);
});
client.connect().catch(console.error);

// 중복검사
// SELECT `login` , COUNT(`login`) FROM live_monit_users GROUP BY `login` HAVING COUNT(`login`)>1;
// 사용자가 많은 그룹
// SELECT `parent` , COUNT(`parent`) FROM live_monit_users GROUP BY `parent` HAVING COUNT(`parent`)>1;
