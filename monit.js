const tmi = require("tmi.js");
const config = require("./js/config");
const StringBuffer = require("./subUtil/stringbuffer");
const {
  live_monit_stream,
  live_monit_users,
  live_monit_user_comm,
  twitch_live_time,
  Op,
  sequelize,
} = require("./models");

const cluster = require("cluster");

const max_users = 200; // 최대 연결개수
const processing_index = process.env.PS_INDEX || 0; //마지막으로 탐색한 사용자 id값

const join_users_name = [];
const is_debug = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isNull = (val) => val === null;
const monit_time = 1000 * 30; // 모니터링 주기

let count = 0;
let isRun = 0;

const workers = [];
let stream_loop = 0;

const chat_logs = {
  ping: 0,
}; // 핑 시간 측정

let last_id = 0;

/*
start 2.26 / 17:10
*/
const makeRandom = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const log = function (...message) {
  if (cluster.isMaster) {
    console.log(message);
  } else {
    try {
      process.send({ pid: process.pid, event: "logs", data: message });
    } catch (error) {
      console.log(error);
    }
  }
};
// const user_view_limit = 1000000;

sequelize
  .sync()
  .then(() => {
    log("DB연결 성공");
  })
  .catch((err) => {
    console.error(err);
  });

const identity = {
  username: "justinfan" + makeRandom(1, 65535),
  password: "SCHMOOPIIE",
};

const client = new tmi.Client({
  // options: { debug: true, messagesLogLevel: "info" },
  connection: {
    reconnect: true,
    secure: true,
  },
  identity,
  channels: [],
});

function worker_message(message) {
  if (message.event === "clone") {
    cluster.fork({ PS_INDEX: message.last_id });
  } else if (message.event === "logs") {
    log(message.pid, message.data);
  } else if (message.event === "ping") {
    chat_logs.process[message.pid] = message.ping;
    chat_logs.update[message.pid] = true;
  }
}

///// 워커 작업공간
if (cluster.isMaster) {
  console.clear();
  console.log(identity);
  cluster.on("online", (worker) => {
    log(`워커 생성 ${worker.process.pid}`);
    workers.push(worker);
    worker.on("message", worker_message);
  });
  cluster.on("exit", (worker, code, signal) => {
    // 워커 죽음
    console.error(`[${worker.process.pid}] ${code} : ${signal}`);
  });
  setInterval(
    function () {
      if (cluster.isMaster) {
        let sum = chat_logs.ping || 0;
        chat_logs.process = chat_logs.process || {};
        chat_logs.update = chat_logs.update || {};
        Object.values(chat_logs.process).forEach((obj) => {
          sum += obj;
        });

        // 최근 업데이트 된 프로세서만 적용
        const sb = new StringBuffer();
        Object.entries(chat_logs.update).forEach((key, values) => {
          if (values) sum += chat_logs.process[key];
          else sb.append(`${key} 프로세서가 업데이트 되지 않음`);
          chat_logs.update[key] = false;
        });
        twitch_live_time
          .create({ time: new Date(), ping: sum })
          .then(() => {})
          .catch(console.error);
        console.log(
          `현재핑 : ${sum} / 서브프로세서 : ${workers.length} ${sb.toString()}`
        );
      }
    },
    is_debug ? 1000 : monit_time
  );
} else {
  log(
    `프로세서 생성 ${process.pid} / ${processing_index} ${JSON.stringify(
      identity
    )}`
  );
}

async function bootJoinUser() {
  if (isRun) return;
  isRun = 1;

  if (join_users_name.length >= max_users) {
    log(`사용자 초과로 인한 서브프로세스 생성 ${cluster.isMaster}`);
    clearInterval(stream_loop);
    // 서브프로세서 생성
    if (cluster.isMaster) {
      // 마스터 사용자
      cluster.fork({ PS_INDEX: last_id });
    } else {
      process.send({ event: "clone", last_id });
    }
    return;
  }
  //SELECT MIN(id), login FROM live_monit_users GROUP BY login
  let query = {
    where: {
      [Op.and]: {
        login: {
          [Op.notIn]: join_users_name,
        },
        id: {
          [Op.gt]: last_id,
        },
      },
    },
    limit: max_users - join_users_name.length,
  };
  if (!join_users_name.length) {
    query = {
      where: {
        id: {
          [Op.gt]: processing_index,
        },
      },
      limit: max_users - join_users_name.length,
    };
  }
  try {
    const join_user = await live_monit_stream.findAll(query);

    for (let i in join_user) {
      if (count >= 20) {
        if (!is_debug) await sleep(1000 * 3);

        // else await sleep(1000);
        log(
          `추가 대기...${i}/${join_user.length}\t\t${join_users_name.length}`
        );
        count = 0;
      } else {
        count += 1;
      }
      if (last_id < join_user[i].id) {
        last_id = join_user[i].id;
      }

      if (!isNull(client.ws.send)) {
        if (!is_debug) client.ws.send(`JOIN #${join_user[i].login}`);
        join_users_name.push(join_user[i].login);
      } else {
        log(`사용자 추가에 실패함! ${join_user[i].login}`);
        await sleep(500);
      }
    }
    log(`사용자 Join : ${join_user.length}/ All :${join_users_name.length}`);
  } catch (e) {
    log(e);
  }
  isRun = 0;
}

// 실행전 초기화 및 대기
function init() {
  if (client.ws && !isNull(client.ws.send)) {
    log("모니터링 시작");
    bootJoinUser();
    stream_loop = setInterval(
      bootJoinUser,
      !is_debug ? config.LIVE_UPDATE_TIME : 1000
    );
  } else {
    setTimeout(init, 1000 * 10);
    console.log(`모니터링 실패`);
  }
}
setTimeout(init, 1000 * 10);

// 사용자 추가 기록
function addUser(login, channel) {
  if (login[0] == "#") login = login.substring(1);
  if (channel[0] == "#") channel = channel.substring(1);

  if (login === channel) return;

  live_monit_users
    .findOrCreate({
      where: {
        login: login,
        parent: channel,
      },
    })
    .then(() => {})
    .catch(log);
}

client.on("timeout", (channel, msg, self, time, tags) => {
  if (self) return;
  log(channel, msg, time);
  live_monit_user_comm
    .create({
      login: channel.substring(1),
      user: msg,
      user_id: tags["target-user-id"],
      time,
      date_comm: new Date(),
    })
    .then(() => {})
    .catch(log);
});

client.on("ban", (channel, msg, self, tags) => {
  if (self) return;
  log(channel, msg);
  live_monit_user_comm
    .create({
      login: channel.substring(1),
      user: msg,
      user_id: tags["target-user-id"],
      time: -1,
      date_comm: new Date(),
    })
    .then(() => {})
    .catch(log);
});

//사용자 입장기록 (데이터 중복 기록 및 탐색 방지)
const join_user_list = {};

client.on("chat", (channel, tags, message, self) => {
  if (self) return;
  const time = new Date();

  if (!chat_logs.time) chat_logs.time = new Date();

  if (time.getTime() > chat_logs.time.getTime() + monit_time) {
    if (cluster.isWorker)
      process.send({ message: "ping", ping: chat_logs.ping });
    // else console.log(`현재핑(매인) : ${chat_logs.ping}`);
    chat_logs.time = time;
    chat_logs.ping = 0;
  } else {
    chat_logs.ping++;
  }
  if (
    !join_user_list[tags.username] ||
    join_user_list[tags.username].indexOf(channel) != -1
  ) {
    // 없는경우
    join_user_list[tags.username] = join_user_list[tags.username] || [];
    join_user_list[tags.username].push(channel);
    addUser(tags.username, channel);
  }
});
client.on("connected", log);
client.connect().catch(log);
