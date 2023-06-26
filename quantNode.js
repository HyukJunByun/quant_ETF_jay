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
    //공공데이터포털 api 키
    const portalKey= req.body.firstKey;
    //census bureau api 키
    const censusKey= req.body.secondKey;

    //오늘 날짜
    let today = new Date();   
    let year = today.getFullYear();                       //년
    let month = ('0' + (today.getMonth() + 1)).slice(-2); //0x 월
    let day = ('0' + today.getDate()).slice(-2);          //0x 일
    let finalToday = year + month + day;                 //20230620 꼴
    let lastYear= year - 1;                               //1년 전
    let lastToday= lastYear + month + day;               //1년 전 오늘

    //스위칭 전략2 실행
    if(switchTwoCheckbox === 'on'){
        //전년 동기 대비 미국 소매 판매 지수 변화율의 3개월 평균의 3개월 방향성
        //6= 저번달, 저저번달, 저저저번달, 저저저저번달, 저저저저저번달, 저저저저저저번달
        let YearMonths= [];
        //위에거 2023-06 꼴의 1년전 -> 2022-06
        let lastYearMonths= [];
        for(let z= 0; z < 6; z++){
            if(parseInt(month) - z - 1 <= 0){
                let beforeMonth= ('0' + (12 + parseInt(month) - z - 1)).slice(-2);
                let beforeYearMonth= lastYear + '-' + beforeMonth;
                YearMonths.push(beforeYearMonth);
                //정해진 달의 1년 전
                let beforeLastYearMonth= (lastYear - 1) + '-' + beforeMonth;
                lastYearMonths.push(beforeLastYearMonth);
            }else{
                let beforeMonth= ('0' + (parseInt(month) - z - 1)).slice(-2);
                let beforeYearMonth= year + '-' + beforeMonth;
                YearMonths.push(beforeYearMonth);
                //정해진 달의 1년 전
                let beforeLastYearMonth= (year - 1) + '-' + beforeMonth;
                lastYearMonths.push(beforeLastYearMonth);
            }
        }; 
        let marts= {};
        async function somay(i){   
            try{
                //올해 미국 소매판매
                let response= await fetch(`http://api.census.gov/data/timeseries/eits/marts?get=cell_value&time=${YearMonths[i]}&time_slot_id&error_data&seasonally_adj=yes&category_code=44X72&data_type_code=SM&for=us:*&key=${censusKey}`);
                let json= await response.json();
                marts[YearMonths[i]] = json[1][0];
//불러온 날짜 체크
                console.log(YearMonths[i]);
                //작년 미국 소매판매
                let response2= await fetch(`http://api.census.gov/data/timeseries/eits/marts?get=cell_value&time=${lastYearMonths[i]}&time_slot_id&error_data&seasonally_adj=yes&category_code=44X72&data_type_code=SM&for=us:*&key=${censusKey}`);
                let json2= await response2.json();
                marts[lastYearMonths[i]] = json2[1][0];
//불러온 1년전 날짜 체크
                console.log(lastYearMonths[i]);
            }
            catch(err){
                console.log("failed= ", err.message);
            }
        };
        for(let v=0; v < YearMonths.length; v++){
            await somay(v);
        };

//test
       console.log('미국 소매판매 지수:', marts);

        //전년 동기 대비 미국 소매 판매지수 변화량 구하기
        let yoy= [];
        for(let h=0; h < YearMonths.length; h++){
            console.log(marts[YearMonths[h]]);
            console.log(lastYearMonths[h]);
            let thisYearMarts = marts[YearMonths[h]];
            let lastYearMarts = marts[lastYearMonths[h]];
            let yoyMarts= thisYearMarts / lastYearMarts - 1;
            yoy.push(yoyMarts);
        }
        //위에서 구한것의 3개월 평균. 총 4개 원소
        let avr3= [];
        for(let t=0; t < 4; t++){
            let nowAvr= (yoy[t] + yoy[t+1] + yoy[t+2]) / 3;
            avr3.push(nowAvr);
        }
//test
        console.log('전년 대비 소매판매지수 변화량의 3개월 평균: ', avr3);

        //위에서 구한것이 3개월 연속 같은 방향성인지 확인.
        function toward(a){
            return avr3[a]/avr3[a+1] - 1;
        };
        //포지션 유지 결론 확인용
        let stayPosition = false;
        (async() => {
            if((toward(0) > 0 && toward(1) > 0 && toward(2) > 0) || (toward(0) < 0 && toward(1) < 0 && toward(2) < 0)){
                //ism pmi지수 3개월치 계산. puppeteer이 속도 늦추기 때문에, 애초에 미국 소매 판매지수 만족 안하면 실행 안하게 설계

                //올해 pmi. 내림차순
                let thisPmi= {};
                //1년 전 pmi
                let lastPmi= {};
                async function process(){
                    const browser = await puppeteer.launch({
        //(중요) 여기 수정 필요!
                        //웹페이지 시각적으로 보고 싶으면 활성화
                        //headless: false,
                        executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'  
                    });
                    const page = await browser.newPage();

                    await page.goto('https://kr.investing.com/economic-calendar/ism-manufacturing-pmi-173');

                    // Wait and click '더 보여주기' -> 작년 pmi 지수 추출
                    const searchResultSelector = '#showMoreHistory173';
                    await page.waitForSelector(searchResultSelector);
                    
                    for(let o= 0; o < 3; o++){
                        //3번 누르기
                        let size= await page.evaluate(() => document.querySelectorAll('td.noWrap').length);
                        await page.click(searchResultSelector);
                        //더 보여주기 누르고 실제 리스트 로드될때까지 대기= 목록 개수 늘어나는지 확인.
                        await page.waitForFunction(`document.querySelectorAll('td.noWrap').length > ${size}`);
                    };
                    const tableList= await page.$$('td.noWrap');

                    //한줄로 불러온 데이터 텍스트 변환까지 실행. 나는 뒤에 필요없는 데이터는 텍스트화 안하려고 이거 안씀.
                    // const tableList= await page.$$eval('td.noWrap', tds => tds.map(td => td.textContent));

                    //가장 최신 pmi가 발표 안된 일정일 경우. '\u00A0' = &nbsp;
                    if(await tableList[0].evaluate(el => el.textContent) === '\u00A0'){
                        for(let l= 0; l < YearMonths.length; l++){
                            let smallPmi= await tableList[3*l + 3].evaluate(el => el.textContent); 
                            thisPmi[YearMonths[l]]= smallPmi;
                            let lastSmallPmi= await tableList[3*l + 3 + 36].evaluate(el => el.textContent);
                            lastPmi[lastYearMonths[l]]= lastSmallPmi; 
        //test  
                            console.log(thisPmi[YearMonths[l]]);
                        }
                    }else{
                        for(let l= 0; l < YearMonths.length; l++){
                            let smallPmi= await tableList[3*l].evaluate(el => el.textContent); 
                            thisPmi[YearMonths[l]]= smallPmi;
                            let lastSmallPmi= await tableList[3*l + 36].evaluate(el => el.textContent);
                            lastPmi[lastYearMonths[l]]= lastSmallPmi;
                        }
                    };
                    //puppeteer 종료
                    await browser.close();
    //test
                    console.log('올해 pmi: ', thisPmi);
                    console.log('1년 전 pmi: ', lastPmi);

                    //전년 대비 변화율 -> thisPmi 
                    for(let m= 0; m < YearMonths.length; m++){
                        thisPmi[YearMonths[m]]= parseFloat(thisPmi[YearMonths[m]]) / parseFloat(lastPmi[lastYearMonths[m]]) - 1.0;
                    }

        //test
                    console.log('전년 대비 변화율= ', thisPmi);

                    //위의 3개월 평균. 4개 원소
                    let avr3Pmi= [];
                    for(let y=0; y < 4; y++){
                        let avrP= (thisPmi[YearMonths[y]] + thisPmi[YearMonths[y+1]] + thisPmi[YearMonths[y+2]]) / 3;
                        avr3Pmi.push(avrP);
                    }

        //test
                    console.log('변화율의 3개월 평균= ', avr3Pmi);

                    //위에서 구한것이 3개월 연속 같은 방향성인지 확인.
                    function towardPmi(a){
                        return avr3Pmi[a]/avr3Pmi[a+1] - 1;
                    }
                    //공공데이터포털 api 불러오기 준비물
                    //데이터를 json 형태로 반환
                    const resultType= "resultType=json&";
                    //1년 전 부터...
                    let beginBasDt=`beginBasDt=${lastToday}&`;
                    //오늘까지 데이터
                    const endBasDt=`endBasDt=${finalToday}&`;
        //test
                    console.log('아래 6개 지표 전부 양수 또는 음수. 아니면 포지션 유지');
                    console.log(toward(0));
                    console.log(toward(1));
                    console.log(toward(2));
                    console.log(towardPmi(0));
                    console.log(towardPmi(1));
                    console.log(towardPmi(2));
                    if((toward(0) > 0 && toward(1) > 0 && toward(2) > 0) && (towardPmi(0) > 0 && towardPmi(1) > 0 && towardPmi(2) > 0)){
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
                            let summonETF= "serviceKey=" + portalKey + "&" + resultType + beginBasDt + endBasDt + "isinCd=" + attackAssets[x].isin;
                            try{
                                let response= await fetch("https://apis.data.go.kr/1160100/service/GetSecuritiesProductInfoService/getETFPriceInfo?" + summonETF);
                                let json= await response.json();
                                let nowPrice= parseInt(json.response.body.items.item[0].clpr);  //공공데이터 포털 참고. 당일 종가
                                let ma200 = 0; //200일 단순이동평균 (지수이동평균 아님.)
        //test
                                console.log(nowPrice);
                                for(let i= 0; i < 200; i++){
                                    ma200 += parseInt(json.response.body.items.item[i].clpr);
                                    //200 영업일의 종가를 전부 더한다.
                                }
                                ma200= ma200 / 200; //그걸 200으로 나누면 단순이동평균 완성.
                                let st_momentum= nowPrice / ma200; //현재 종가/200일 이평
                                attackAssets[x]['momentum']= st_momentum;
                            }
                            catch(err){
                                console.log("공격자산 etf 오류: ", err.message);
                            };
                        };
                        //위의 fetch를 공격자산에 대하여 총 3번 반복.
                        //모멘텀 높은 순으로 내림차순 배열
                        attackAssets.sort((a, b) => b['momentum'] - a['momentum']);

        //test
                        console.log('공격자산 내림차순(이름, isin, 모멘텀)= ', attackAssets);

                        //수익률 탑1 종목 선정
                        fs.readFile(__dirname + '/index.html', 'utf8', (err, data) => {
                            const resultAttack= `
                            <fieldset style="background-color: cadetblue;">
                            <legend><strong>스위칭 전략2:</strong></legend>
                            <div>
                                <h4>공격자산 매수<h4>
                                <h5>1. ${protectAssets[0].ETFname}<h5>
                            </div>
                            </fieldset>`;
                            const search = data.replace('<span id="quantResult2"></span>', resultAttack);
                            res.send(search); 
                        });
                    }else if((toward(0) < 0 && toward(1) < 0 && toward(2) < 0) && (towardPmi(0) < 0 && towardPmi(1) < 0 && towardPmi(2) < 0)){
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
                            let summonETF= "serviceKey=" + portalKey + "&" + resultType + beginBasDt + endBasDt + "isinCd=" + protectAssets[x].isin;
                            try{
                                let response= await fetch("https://apis.data.go.kr/1160100/service/GetSecuritiesProductInfoService/getETFPriceInfo?" + summonETF);
                                let json= await response.json();
                                let nowPrice= parseInt(json.response.body.items.item[0].clpr);  //공공데이터 포털 참고. 당일 종가
        //test
                                console.log(nowPrice);
                                //6개월 전 종가
                                let sixMonthPrice= parseInt(json.response.body.items.item[parseInt(json.response.body.totalCount) - 1].clpr);
                                protectAssets[x]['profit']= nowPrice / sixMonthPrice - 1;
                            }
                            catch(err){
                                console.log("안전자산 etf 오류: ", err.message);
                            };
                            // fetch("https://apis.data.go.kr/1160100/service/GetSecuritiesProductInfoService/getETFPriceInfo?" + summonETF)
                            // .then(checkApi)
                            // .then(response => {
                            //     return response.json();})
                            // .then(json => {
                            //     let nowPrice= parseInt(json.response.body.items.item[0].clpr);  //공공데이터 포털 참고. 당일 종가
                            //     //6개월 전 종가
                            //     let sixMonthPrice= parseInt(json.response.body.items.item[parseInt(json.response.body.totalCount) - 1].clpr);
                            //     protectAssets[x]['profit']= nowPrice / sixMonthPrice - 1;
                            // })
                            // .catch(err => {
                            //     console.log("there is a problem: " + err.message);
                            // });
                        };
                        //수익률 높은 순으로 내림차순 배열
                        protectAssets.sort((a, b) => b['profit'] - a['profit']);

        //test
                        console.log('안전자산 내림차순(이름, isin, 6개월 수익률)= ', protectAssets);

                        //수익률 탑3 종목 선정
                        fs.readFile(__dirname + '/index.html', 'utf8', (err, data) => {
                            const resultProtect= `
                            <fieldset style="background-color: cadetblue;">
                            <legend><strong>스위칭 전략2:</strong></legend>
                            <div>
                                <h4>안전자산 매수<h4>
                                <h5>1. ${protectAssets[0].ETFname}<h5>
                                <h5>2. ${protectAssets[1].ETFname}<h5>
                                <h5>3. ${protectAssets[2].ETFname}<h5>
                            </div>
                            </fieldset>`;
                            const search = data.replace('<span id="quantResult2"></span>', resultProtect);
                            res.send(search); 
                        });
                    }
                    else{
                        stayPosition = true;
                    };
                };
                await process();
            };
            if(stayPosition){
                fs.readFile(__dirname + '/index.html', 'utf8', (err, data) => {        
        //test
                    console.log('포지션 유지');
                    const resultSame= `
                    <fieldset style="background-color: cadetblue;">
                    <legend><strong>스위칭 전략2:</strong></legend>
                    <div>
                        <h5>기존 포지션 유지<h5>
                    </div>
                    </fieldset>`;
                    const search = data.replace('<span id="quantResult2"></span>', resultSame);
                    res.send(search); 
                });
            };
        //(async() => {
        })();
    //스위치전략2.checked
    };
//app.post    
});

app.listen(7000, () =>{
    console.log('여기로 접속하세요! http://localhost:7000/');
});