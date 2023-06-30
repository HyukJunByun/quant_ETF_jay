//this project is using ES Module
import express from 'express';
const app= express();
//modify html file
import fs from "fs";
//for fetching api
import fetch from 'node-fetch';
//npm i puppeteer-core for web scraping
//일반 puppeteer과 다르게 크롬 브라우저를 자동 설치하지 않는다.
import puppeteer from 'puppeteer-core';
//esm에서는 __dirname 사용이 안됨. 그래서 추가한 모듈
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { count } from 'console';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

//json 형태로 파싱
app.use(express.json());
app.use(express.urlencoded({extended : true}));

//css 찾기 쉽게 public 폴더 사용.
app.use(express.static('public'));

//메인 홈페이지 처음 실행 시
app.get("/", (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

//결과 확인하기 버튼 누르기
app.post("/", async function(req, res){
    //find by name
    //다양한 전략들.
    const switchTwoCheckbox= req.body.switch2;
    const laaDualCheck= req.body.laa;
    const baaAggCheck= req.body.baa;
    const jasanCheck= req.body.distribute;
    //공공데이터포털 api 키
    const portalKey= req.body.firstKey;
    //census bureau api 키
    const censusKey= req.body.secondKey;

    //최종 결과 모음
    let resultETF= [];

    //오늘 날짜
    let today = new Date();  
    let year, month, day, finalToday, lastYear, lastToday; 
    function getTime(){
        year = today.getFullYear();                       //년
        month = ('0' + (today.getMonth() + 1)).slice(-2); //0x 월
        day = ('0' + today.getDate()).slice(-2);          //0x 일
        finalToday = year + month + day;                 //20230620 꼴
        lastYear= year - 1;                               //1년 전
        lastToday= lastYear + month + day;               //1년 전 오늘
    };
    getTime();
    //스위칭 전략2 실행
    if(switchTwoCheckbox === 'on'){
        //스위칭전략2 요약= 미국 소매판매지수 + pmi -> 공격자산 또는 안전자산

        //전년 동기 대비 미국 소매 판매 지수 변화율의 3개월 평균의 3개월 방향성
        //6= 저번달, 저저번달, 저저저번달, 저저저저번달, 저저저저저번달, 저저저저저저번달
        let YearMonths= [];
        //위에거 2023-06 꼴의 1년전 -> 2022-06
        let lastYearMonths= [];
        //아래 3개 변수는 while 문에서 쓰임. 거기에 주석 설명 있음.
        let counter = 0;
        let recentYM, recentLYM;
        function createYearMonth(z, tf= true){
            let beforeYearMonth, beforeLastYearMonth;
            if(parseInt(month) - z - 1 <= 0){
                let beforeMonth= ('0' + (12 + parseInt(month) - z - 1)).slice(-2);
                beforeYearMonth= lastYear + '-' + beforeMonth;
                //정해진 달의 1년 전
                beforeLastYearMonth= (lastYear - 1) + '-' + beforeMonth;
            }else{
                let beforeMonth= ('0' + (parseInt(month) - z - 1)).slice(-2);
                beforeYearMonth= year + '-' + beforeMonth;
                //정해진 달의 1년 전
                beforeLastYearMonth= (year - 1) + '-' + beforeMonth;
            };
            if(tf){
                //boolean. true면 일반적으로 날짜 리스트 만들고, false면 새로 만든 날짜값 2개 배열 형태로 반환
                YearMonths.push(beforeYearMonth);
                lastYearMonths.push(beforeLastYearMonth);
            }else{
                return [beforeYearMonth, beforeLastYearMonth];
            };
        };
        for(let z= 0; z < 6; z++){
            //날짜를 내림차순으로 정렬. (앞으로 갈수록 최신)
            createYearMonth(z);    
        }; 
//test        
        console.log('2022-06 꼴= ', YearMonths);
        let marts= {};
        //올해 pmi. 내림차순
        let pmis= {};
        //parameter-> 평소에는 YearMonth에 들어있는 날짜로 계산하지만, 밑에 while문에서는 YearMonth에 없는 6개월치 데이터를 미리 가져온다.
        async function collectData(choose, w="normal"){
            if(choose === "marts"){
            //소매 판매지수 모으기(YearMonth에 있는 시작과 끝 날짜 사이 데이터를 가져온다.)
                try{
                    //미국 소매판매지수 이날부터...
                    let fromDate= YearMonths[YearMonths.length - 1];
                    //이날 사이 데이터 전부 불러오기
                    let toDate= YearMonths[0];
                    let ffromDate= lastYearMonths[lastYearMonths.length - 1];
                    let ttoDate= lastYearMonths[0];
                    if(w === "while"){
                        delete marts[recentYM];
                        delete marts[recentLYM];
                        //매번 업데이트 되는 YearMonth의 마지막 원소가 marts에 없다면 6개월 데이터 불러오기
                        if(!(YearMonths[YearMonths.length - 1] in marts)){
                            //marts에 업데이트 안된 날짜부터 과거로 6개월 (2023-06꼴)
                            let updateFrom= createYearMonth(10, false);
                            let updateTo= createYearMonth(5, false);
                            fromDate= updateFrom[0];
                            toDate= updateTo[0];
                            ffromDate= updateFrom[1];
                            ttoDate= updateTo[1];
    //test
                            console.log('과거 6개월 업데이트 완료= ', updateFrom[0], "~", updateTo[0]); 
                        }else{
                            //이미 업데이트한 데이터 있으면 api 호출 안하고 종료
                            return;
                        };
                    };
                    //올해 6개월치 미국 소매판매
                    let response= await fetch(`http://api.census.gov/data/timeseries/eits/marts?get=cell_value&time=from+${fromDate}+to+${toDate}&time_slot_id&error_data&seasonally_adj=yes&category_code=44X72&data_type_code=SM&for=us:*&key=${censusKey}`);
                    //받아온 json 데이터는 날짜 오름차순으로 정렬. (뒤로 갈수록 최신)
                    let json= await response.json();
    //test
                    console.log(toDate, "부터 6개월치 소매판매 데이터 수집");
                    //작년 6개월치 미국 소매판매
                    let response2= await fetch(`http://api.census.gov/data/timeseries/eits/marts?get=cell_value&time=from+${ffromDate}+to+${ttoDate}&time_slot_id&error_data&seasonally_adj=yes&category_code=44X72&data_type_code=SM&for=us:*&key=${censusKey}`);
                    let json2= await response2.json();       
    //test
                    console.log(ttoDate, "부터 6개월치 소매판매 데이터 수집");
                    for(let h= 0; h < YearMonths.length; h++){
                        //{"2023-06": "12345"}꼴의 객체
                        marts[json[h+1][1]] = json[h+1][0];
                        marts[json2[h+1][1]] = json2[h+1][0];
                    }
    //test
                    console.log('미국 소매판매지수 목록= ', marts);
                }
                catch(err){
                    console.log("(스위칭전략2)미국 소매판매지수 불러오기 실패= ", err.message);
                };
            }else if(choose === "pmi"){
            //pmi 지수 모으기
                try{
                    let newCounter= 0;
                    //while 문에서 6개월치 업데이트 할때 필요한 날짜 정보.(내림차순)
                    let thisYearDate= [];
                    let lastYearDate= [];
                    let checkBlankFirstWhile= YearMonths.length;
                    if(w === "while"){
                        delete pmis[recentYM];
                        delete pmis[recentLYM];
                        //매번 업데이트 되는 YearMonth의 마지막 원소가 pmis에 없다면 6개월 데이터 불러오기
                        if(!(YearMonths[YearMonths.length - 1] in pmis)){
                            //pmis에 업데이트 안된 날짜부터 과거로 6개월 (2023-06꼴)
                            for(let s= 0; s < 6; s++){
                                let update= createYearMonth(s + 5, false);
                                thisYearDate.push(update[0]);
                                lastYearDate.push(update[1]);
                            }
                        }else{
                            //이미 업데이트한 데이터 있으면 api 호출 안하고 종료
                            return;
                        };
                    };
                    let browser = await puppeteer.launch({
                        //(중요) 여기 기기마다 다름!!
                        //웹페이지 시각적으로 보고 싶으면 활성화
                        //headless: false,
                        executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'  
                    });
                    let page = await browser.newPage();
            
                    await page.goto('https://kr.investing.com/economic-calendar/ism-manufacturing-pmi-173');
            
                    // Wait and click '더 보여주기' -> 작년 pmi 지수 추출
                    let searchResultSelector = '#showMoreHistory173';
                    await page.waitForSelector(searchResultSelector);
                    
                    for(let o= 0; o < howManyClick(); o++){
                        //3번 누르기(+a)
                        let size= await page.evaluate(() => document.querySelectorAll('td.noWrap').length);
                        await page.click(searchResultSelector);
                        //더 보여주기 누르고 실제 리스트 로드될때까지 대기= 목록 개수 늘어나는지 확인.
                        await page.waitForFunction(`document.querySelectorAll('td.noWrap').length > ${size}`);
                    };
                    let tableList= await page.$$('td.noWrap');
            
                    //한줄로 불러온 데이터 텍스트 변환까지 실행. 나는 뒤에 필요없는 데이터는 텍스트화 안하려고 이거 안씀.
                    // const tableList= await page.$$eval('td.noWrap', tds => tds.map(td => td.textContent));   
        
                    //웹사이트 가장 최신 pmi가 비어있는지 확인 후, 뒤에 pmi 데이터 가져온다.
                    async function checkIfFirstPmiBlank(l, k, w){
                        let llist= YearMonths[l];
                        let lastLlist= lastYearMonths[l];
                        if(w === "while"){
                            llist= thisYearDate[l];
                            lastLlist= lastYearDate[l];
                        };
                        let smallPmi= await tableList[3*l + 3*k].evaluate(el => el.textContent); 
                        pmis[llist]= smallPmi;
                        let lastSmallPmi= await tableList[3*l + 3*k + 36].evaluate(el => el.textContent);
                        pmis[lastLlist]= lastSmallPmi; 
                    //test  
                        console.log('일자별 pmi= ', pmis[llist]);
                    };
                    if(w === "while"){
                        //최종적으로는 '더 불러오기' 1번 누를 때마다 갱신되는 6개월치 데이터 한꺼번에 불러온다.
                        newCounter= 6 * (howManyClick() - 2);
                        if(howManyClick() === 3){
                            //가장 최신 pmi가 발표 안된 일정일 경우. '\u00A0' = &nbsp;
                            if(await tableList[0].evaluate(el => el.textContent) === '\u00A0'){
                                //첫 pmi 빈칸이고 while문에 처음 들어왔다면 6개월이 아니라 5개월치만 불러온다. (웹페이지 구조 문제)
                                checkBlankFirstWhile = 5;
                                newCounter += 1;
                            };
                        };
                    }else{
                        //가장 최신 pmi가 발표 안된 일정일 경우. '\u00A0' = &nbsp;
                        if(await tableList[0].evaluate(el => el.textContent) === '\u00A0'){
                            newCounter = 1;
                        };
                    };
                    for(let l= 0; l < checkBlankFirstWhile; l++){
                            await checkIfFirstPmiBlank(l, newCounter, w);
                    };
                    //puppeteer 종료
                    await browser.close();
            //test
                    console.log('pmi: ', pmis);
                }
                catch(err){
                    console.log("(스위칭전략2)pmi 불러오기 실패= ", err.message);
                };  
            //else if pmi
            };
        //function collectData()
        };

        //전년 동기 대비 변화량 구하기
        let martsYoY= {};
        let pmiYoY = {};

        //포지션 유지 결론 확인용
        let stayPosition = true;

        function calculateYoY(m, choose, w="normal"){
            let myList, listYoY;
            if(choose === "marts"){
                myList= marts;
                listYoY= martsYoY;
            }
            else if(choose === "pmi"){
                myList= pmis;
                listYoY= pmiYoY;
            };
            let thisYearData = parseFloat(myList[YearMonths[m]]);
            let lastYearData= parseFloat(myList[lastYearMonths[m]]);
            listYoY[YearMonths[m]]= thisYearData / lastYearData - 1;
            if(w === "while"){
                //while 문에서 최신 데이터 제거
                delete listYoY[recentYM];
            };
        };

        //전년 동기 대비 변화량의 3개월 평균. 총 4개 원소
        let avr3Marts= [];
        let avr3Pmi= [];
        
        function calculateAvr3(t, choose, w="normal"){
            let listYoY, avr3;
            if(choose === "marts"){
                listYoY= martsYoY;
                avr3= avr3Marts;
            }
            else if(choose === "pmi"){
                listYoY= pmiYoY;
                avr3= avr3Pmi;
            };
            //3개월 평균 구하기
            let nowAvr= (listYoY[YearMonths[t]] + listYoY[YearMonths[t+1]] + listYoY[YearMonths[t+2]]) / 3;
            avr3.push(nowAvr);
            if(w === "while"){
                //while 문에서 최신 데이터 제거
                avr3.shift();
            };
            console.log('전년 대비 변화량의 3개월 평균: ', avr3);
        };
        function avr3MonthChange(b, c){
            //3개월 평균의 전월 대비 증감 계산
            return b[c] - b[c+1];
        };
        //위에서 구한것이 3개월 연속 같은 방향성인지 확인.
        function isAll(choose){
            let a;
            if(choose === "marts"){
                a= avr3Marts;
            }else if(choose === "pmi"){
                a= avr3Pmi;
            };
            if((avr3MonthChange(a, 0)) > 0 && (avr3MonthChange(a, 1)) > 0 && (avr3MonthChange(a, 2)) > 0){
                return 'positive';
            }else if((avr3MonthChange(a, 0)) < 0 && (avr3MonthChange(a, 1)) < 0 && (avr3MonthChange(a, 2)) < 0){
                return 'negative';
            };
        };
        //공공데이터포털 api 불러오기 준비물
        //데이터를 json 형태로 반환
        const resultType= "resultType=json&";
        //1년 전 부터...
        let beginBasDt=`beginBasDt=${lastToday}&`;
        //오늘까지 데이터
        let endBasDt=`endBasDt=${finalToday}&`;
//test
        function checkIfAllSame(){
            console.log('아래 6개 지표 전부 양수 또는 음수. 아니면 포지션 유지');
            console.log('소매지수 3개월 평균= ');
            for(let i=0; i < 3; i++){
                console.log(avr3MonthChange(avr3Marts, i));
            };
            console.log('pmi 3개월 평균= ');
            for(let i=0; i < 3; i++){
                console.log(avr3MonthChange(avr3Pmi, i));
            };
        };
        async function average3MonthData(choose, w= "normal"){
            try{
                let h_w = 0, t_w = 0;
                if(w === "while"){
                    h_w= YearMonths.length-1;
                    t_w= 3;
                };
                //지표 데이터 모아서...
                await collectData(choose, w);
                //전년 동기 대비 변화량을 구하고...
                for(let h=h_w; h < YearMonths.length; h++){
                    calculateYoY(h, choose, w);
                };
                //변화량의 3개월 연속 평균을 구한다.
                for(let t=t_w; t < 4; t++){
                    calculateAvr3(t, choose, w);
                };
            }
            catch(err){
                console.log('스위칭전략2 pmi/marts 최종 계산 오류: ', err.message);
            };
        };
        async function calculateAttack(){
            //공격자산
            //ETF의 ISIN 코드. 추후에 sql db 형태로 활용 예정.
            let attackAssets= [
                {ETFname: 'KODEX 200TR', isin: 'KR7278530001'},
                {ETFname: 'TIGER 차이나CSI300', isin: 'KR7192090009'},
                {ETFname: 'KODEX 미국S&P 500(H)', isin: 'KR7449180009'}
            ];
            for(let x=0; x < attackAssets.length; x++){
                //etf 정보 api 불러오기
                //서비스키 둘 중에 하나 아직 확정 안남. 테스트 필요.
                let summonETF= "serviceKey=" + portalKey + "&" + "numOfRows=200&" + resultType + beginBasDt + endBasDt + "isinCd=" + attackAssets[x].isin;
                try{
                    let react= await fetch("https://apis.data.go.kr/1160100/service/GetSecuritiesProductInfoService/getETFPriceInfo?" + summonETF);
                    let json= await react.json();
                    let priceList= json.response.body.items.item;
                    let nowPrice= parseInt(priceList[0].clpr);  //공공데이터 포털 참고. 당일 종가
                    let ma200 = 0; //200일 단순이동평균 (지수이동평균 아님.)
//test
                    console.log('nowPrice= ', nowPrice);
                    for(let i= 0; i < 200; i++){
                        ma200 += parseInt(priceList[i].clpr);
                        //200 영업일의 종가를 전부 더한다.
                    }
                    ma200= ma200 / 200; //그걸 200으로 나누면 단순이동평균 완성.
                    let st_momentum= nowPrice / ma200; //현재 종가/200일 이평
                    attackAssets[x]['momentum']= st_momentum;
                }
                catch(err){
                    console.log("스위칭전략2 공격자산 etf 오류: ", err.message);
                };
            };
            //위의 fetch를 공격자산에 대하여 총 3번 반복.
            //모멘텀 높은 순으로 내림차순 배열
            attackAssets.sort((a, b) => b['momentum'] - a['momentum']);

//test
            console.log('공격자산 내림차순(이름, isin, 모멘텀)= ', attackAssets);

            //수익률 탑1 종목 선정
            resultETF.push(`
                <fieldset style="background-color: cadetblue;">
                <legend><strong>스위칭 전략2:</strong></legend>
                <div>
                    <h4>공격자산 매수<h4>
                    <h5>1. ${attackAssets[0].ETFname}<h5>
                </div>
                </fieldset>`);
        };
        async function calculateProtect(){
            //안전자산
            //ETF의 ISIN 코드. 추후 sql db를 활용할 예정.
            let protectAssets= [
                {ETFname: 'ACE 국고채10년', isin: 'KR7365780006'},
                {ETFname: 'KODEX 국고채 30년액티브', isin:'KR7439870007'},
                {ETFname: 'TIGER 단기선진하이일드(합성H)', isin:'KR7182490003'},
                {ETFname: 'KODEX 단기채권 plus', isin:'KR7214980005'},
                {ETFname: 'TIGER 단기통안채', isin:'KR7157450008'},
                {ETFname: 'KBSTAR 중기우량회사채', isin:'KR7136340007'},
                {ETFname: 'ARIRANG 미국단기우량회사채', isin:'KR7332610005'},
                {ETFname: 'SOL 국고채 3년', isin:'KR7438560005'},
                {ETFname: 'ARIRANG 미국장기우량회사채', isin:'KR7332620004'}
            ];
            //오늘부터 6개월 전
            let sixToday;
            if(parseInt(month) - 6 <= 0){
                let sixMonth= ('0' + (12 + parseInt(month) - 6)).slice(-2);
                sixToday= lastYear + sixMonth + day;
            }else{
                let sixMonth= ('0' + (parseInt(month) - 6)).slice(-2);
                sixToday= year + sixMonth + day;
            };

//test
            console.log('6개월 전= ', sixToday);

            beginBasDt=`beginBasDt=${sixToday}&`;
            for(let x= 0; x < protectAssets.length; x++){
                //etf 정보 api 불러오기
                //서비스키 encoding ver
                let summonETF= "serviceKey=" + portalKey + "&" + "numOfRows=180&" + resultType + beginBasDt + endBasDt + "isinCd=" + protectAssets[x].isin;
                try{
                    let react= await fetch("https://apis.data.go.kr/1160100/service/GetSecuritiesProductInfoService/getETFPriceInfo?" + summonETF);
                    let json= await react.json();
                    let priceList= json.response.body.items.item;
//test
                    console.log('안전자산 가격 리스트= ', priceList);
                    let nowPrice= parseInt(priceList[0].clpr);  //공공데이터 포털 참고. 당일 종가
                    console.log('지금 가격= ', nowPrice);
                    //6개월 전 종가
                    let sixMonthPrice= parseInt(priceList[parseInt(json.response.body.totalCount) - 1].clpr);
                    protectAssets[x]['profit']= nowPrice / sixMonthPrice - 1;
                }
                catch(err){
                    console.log("스위칭전략2 안전자산 etf 오류: ", err.message);
                };
            };
            //수익률 높은 순으로 내림차순 배열
            protectAssets.sort((a, b) => b['profit'] - a['profit']);

//test
            console.log('안전자산 내림차순(이름, isin, 6개월 수익률)= ', protectAssets);

            //수익률 탑3 종목 선정
            resultETF.push(`
                <fieldset style="background-color: cadetblue;">
                <legend><strong>스위칭 전략2:</strong></legend>
                <div>
                    <h4>안전자산 매수<h4>
                    <h5>1. ${protectAssets[0].ETFname}<h5>
                    <h5>2. ${protectAssets[1].ETFname}<h5>
                    <h5>3. ${protectAssets[2].ETFname}<h5>
                </div>
                </fieldset>`);
        };

        //위에 두 자산 다루기 함수를 조건이 달성됐을 경우 실행시키는 함수
        async function chooseAssets(){
            if(isAll("marts") === 'positive' && isAll("pmi") === 'positive'){
                console.log('6개 지표 양수여서 if안으로 진입!');
                //지표 전부다 양수면 공격자산
                await calculateAttack()
                .then(() => stayPosition = false);
            }else if(isAll("marts") === 'negative' && isAll("pmi") === 'negative'){
                console.log('6개 지표 음수여서 else if안으로 진입!');
                //지표 전부다 음수면 안전자산
                await calculateProtect()
                .then(() => stayPosition = false);
            };
        };

        //1번 누를때마다 6행씩 추가됨.
        //점점 과거 데이터 가져올수록 '더 불러오기' 누르는 횟수 증가
        function howManyClick(){
            if(counter < 6){
                return 3;
            }else{
                let addClick= parseInt((counter - 5)/6);
                return 4 + addClick;
            };
        };
        //사실상 여기가 본체
        async function mainFunc(w="normal"){
            try{
                //2개 지수 동시에 계산
                await Promise.all([average3MonthData("marts", w), average3MonthData("pmi", w)]);
    //test            
                checkIfAllSame();
                //공공데이터포털 api 불러오기 준비물
                //1년 전 부터...
                beginBasDt=`beginBasDt=${lastToday}&`;
                //오늘까지 데이터
                endBasDt=`endBasDt=${finalToday}&`;
                await chooseAssets();
            }
            catch(err){
                console.log('스위칭전략2 main 함수 error: ', err);
            };
        };
        await mainFunc();
        while(stayPosition){   
            //while 문 반복 횟수 체크
            counter += 1;    
            //포지션 유지일 경우 1개월씩 과거로 돌아가서 공격 또는 안전자산 선택할때까지 (pmi + 미국 소매 판매 지수) 반복
            //단, 효율성을 위해서 과거 1개월 데이터 추가, 최신 1개월 데이터 제거 형식으로 반복.
            console.log(finalToday, '= 포지션 유지');

            //1개월 전 날짜
            today.setMonth(today.getMonth() - 1);   
            getTime();
            //1개월 더 과거(6 + n 개월) 날짜 추가
            createYearMonth(5);
            //최신 (n 개월) 날짜 제거
            recentYM= YearMonths.shift();
            recentLYM= lastYearMonths.shift();
            await mainFunc("while");
        };
    //스위치전략2.checked
    };
    if(laaDualCheck === 'on'){
        //laa + dual 전략
    };

    //최종 결과 출력
    fs.readFile(__dirname + '/index.html', 'utf8', (err, data) => { 
        const rrresult = resultETF.join('');      
        const search = data.replace('<span id="quantResult"></span>', rrresult);
        res.send(search); 
    });
//app.post    
});

app.listen(7000, () =>{
    console.log('여기로 접속하세요! http://localhost:7000/');
});