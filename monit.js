const tmi = require('tmi.js');
const config = require("./js/config");
const axios = require('axios');
const { live_monit_stream, live_monit_users, live_monit_user_comm, twitch_token, Op } = require('./models');

/*
start 2.26 / 17:10
*/
const makeRandom=(min,max)=>{return Math.floor(Math.random()*(max-min+1))+min}

const client = new tmi.Client({
	// options: { debug: true, messagesLogLevel: "info" },
	connection: {
		reconnect: true,
		secure: true
	},
	identity: {
		username: "justinfan"+makeRandom(1,65535),
		password: "SCHMOOPIIE"
	},
	channels: []
});

async function getToken(user_id='갱신하는사람 토큰 id값'){
  let user = await twitch_token.findOne({where:{user_id}});// 유효토큰

  if(!user){
		return false;
	}else if(user.updatedAt.getTime() + (user.expires_in * 1000 + 30) < new Date().getTime()){
    const token = await axios.post(`https://id.twitch.tv/oauth2/token?grant_type=refresh_token&${
      [ `refresh_token=${user.refresh_token}`,
        `client_id=${config.twitch_passport_options.clientID}`,
        `client_secret=${config.twitch_passport_options.clientSecret}`
      ].join("&")
    }`);
    if(token.status != 200)return false;// 갱신에 실패

		await twitch_token.update({
      access_token:token.data.access_token,
      expires_in:token.data.expires_in
    },{where:{user_id}});

		return token.data.access_token;
  }
  return user.access_token;
}

const join_users_name = [];
const outof_users_name = [];
const qury_users_name = [];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const isNull = val => val === null;
let count = 0;
let isRun = 0
async function bootJoinUser(){
	if(isRun)return;
	isRun = 1;
	//SELECT MIN(id), login FROM live_monit_users GROUP BY login
	let query = {
		where:{
			[Op.not]:{
				login:{
					[Op.in]:join_users_name
				}
			}
		}
	};
	if(!join_users_name.length){
		query = {};
	}
	try{
		const join_user = await live_monit_stream.findAll(query);

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
				await sleep(500);
			}
		}
		console.log(`사용자 Join : ${join_user.length}/ All :${join_users_name.length}`);
		console.log(`예외 사용자 : ${outof_users_name.length}/ 스텍 :${qury_users_name.length}`);
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
	if(login === channel)
		return;
	if(outof_users_name.indexOf(login)!= -1 ||
	 		join_users_name.indexOf(login)!= -1 ||
			qury_users_name.indexOf(login)!= -1){
		// ?
	}else{// 신규사용자
		if(join_users_name.length <= 600){
			qury_users_name.push(login);
			if(qury_users_name.length >= 100){
				const qury = qury_users_name.join('&login=');
				qury_users_name.length = 0;
				getToken().then(token=>{
					return axios({
						method:"GET",
						url:`https://api.twitch.tv/helix/users?login=${qury}`,
						headers:{
							'Client-Id':config.twitch_passport_options.clientID,
							'Authorization':`Bearer ${token}`
						}
					});
				}).then(sucess=>{
					if(sucess.status == 200){
						const data = sucess.data.data;
						const pop_user = data.filter(user=>user.view_count > 50000).map(user=>user.login);
						for (let i in pop_user){
							live_monit_stream.findOrCreate({
								where: {login: pop_user[i]}
							}).then(()=>{}).catch(console.error);
						}
						console.log(`추가 사용자 ${pop_user.length} 명`);
						console.log(pop_user);
						outof_users_name.push(...data.filter(user=>user.view_count < 50000).map(user=>user.login));
					}
				}).catch(console.error);
				console.log(`사용자 정보를 통하여 리스트를 불러옵니다!`);
			}// if
		}
	}//else
	live_monit_users.findOrCreate({
		where: {login: login, parent: channel}
	}).then(()=>{}).catch(console.error);

}

client.on('connected', (msg)=>{
	console.log(msg);
});

client.on('timeout', (channel, msg, self, time, tags) => {
		if(self) return;
		live_monit_user_comm.create({
			login:channel.substring(1),
			user:msg,
			user_id:tags['target-user-id'],
			time,date_comm : new Date()
		}).then(()=>{}).catch(console.error);
});
client.on('ban', (channel, msg, self, tags) => {
		if(self) return;
		live_monit_user_comm.create({
			login:channel.substring(1),
			user:msg,
			user_id:tags['target-user-id'],
			time: -1,
			date_comm : new Date()
		}).then(()=>{}).catch(console.error);
});
client.on('chat', (channel, tags, message, self) => {// 채팅 사용자만 발견
	if(self) return;
	addUser(tags.username,channel);
});
client.connect().catch(console.error);
