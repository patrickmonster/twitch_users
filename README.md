# twitch_users
트위치 유저 탐색

사용인원 탐색
- 목적 : 통계용 / 사용자 추적 및 사용자 목록
- 탐색법 : 라이브 채팅 사용자 추적하여, tmi.js 를 통하여 수신되는 아이디 정보를 통하여 사용자 irc채널에 참여, 반복.

사용 라이브러리
tmi.js - irc 채팅 모듈
sequelize - 디비




2.25~2.26

사용자 : 35795명

차트 - 부모 
![chart](https://user-images.githubusercontent.com/7522634/109256677-d95aaf00-7839-11eb-8dcf-27170f30fe6d.png)
   


결론: 일정 트레픽이 넘어가면 서버 접속이 불안해짐
 -> 대규모일 경우, 서버 트래픽을 분산 시켜야 하는 필요성을 느낌.
 -> 분활 서버일 경우, DB를 통하여 사용자 트래픽에 관하여 연결 정도를 수정하여야 함.



2.28

사용자 측정 오류부분 개선
- [익명사용자 로그인][https://github.com/patrickmonster/twitch_users/blob/1595edee240db2591bc343abfbb667fbf2998b2f/monit.js#L18] > 
- 특정 채널 사용자/ 누적뷰가 50000뷰 이상 나오는 채널 > [누적뷰 높은 사용자 필터링][https://github.com/patrickmonster/twitch_users/blob/1595edee240db2591bc343abfbb667fbf2998b2f/monit.js#L138]
- [매니져 관리 활동 모니터링][https://github.com/patrickmonster/twitch_users/blob/1595edee240db2591bc343abfbb667fbf2998b2f/monit.js#L162]  > 차후 데이터 수집 및 필터를 위하여... 
- [토큰갱신][https://github.com/patrickmonster/twitch_users/blob/1595edee240db2591bc343abfbb667fbf2998b2f/monit.js#L24] > 사용자 정보를 취득하기 위하여 토큰정보를 항시 갱신함.

결과
사용자가 무작위로 추가되지 않아, API 통신을 줄임
![chart](https://user-images.githubusercontent.com/7522634/109418996-79693180-7a0e-11eb-82ca-53b5bd2948db.png)

3.14

프로세서 분업을 통하여 api 데이터 처리율 높임
 - 사용자가 증가 할 수록 데이터 처리속도가 느려져, ping처리가 늦어지면 해당 통신이 비활성화 됨.
 - 일부 사용자 정보를 캐싱하고 있어야, 비정상적인 디비 처리율이 낮아짐
 - 채팅핑 측정기능
 - 서브프로세서 분활하여 사용자 처리를 유연하게 함
