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

//json 형태로 파싱
app.use(express.json());
app.use(express.urlencoded({extended : true}));

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

    //api 제대로 불러오는지 확인
    function checkApi(response){
        if(response.ok){
            return response;
        }else{
            throw Error("api를 불러오는데 실패했습니다. 인증키가 만료됐는지 확인해주세요.");
        }
    };


    //스위칭 전략2 실행
    if(switchTwoCheckbox === 'on'){
        //전년 동기 대비 미국 소매 판매 지수 변화율의 3개월 평균의 3개월 방향성
        //저번달, 저저번달, 저저저번달, 저저저저번달, 저저저저저번달, 저저저저저저번달
        let months= [];
        for(let z= 0; z < 6; z++){
            if(parseInt(month) - z - 1 <= 0){
                let lastMonth= ('0' + (12 + month - z - 1)).slice(-2);
                months.push(lastMonth);
            }else{
                months.push(('0' + (month - z - 1)).slice(-2));
            }
        }
        //2023-06 꼴 만드는 함수
        function dateForCensus(a, b){
            return a + '-' + b;
        }
        //미국 소매지수 데이터. 올해 + 직년 전부 
        let marts= {};
        for(let v=0; v < months.length; v++){
            //올해 미국 소매지수 가져오기
            fetch(`http://api.census.gov/data/timeseries/eits/marts?get=cell_value&time=${dateForCensus(year, months[v])}&time_slot_id&error_data&seasonally_adj=yes&category_code=44X72&data_type_code=SM&for=us:*&key=${censusKey}`)
            .then(checkApi)
            .then(response => {
                return response.json();
            })
            .then(json => {
                //날짜 : 당월 소매지수 데이터 꼴로 객체에 저장.
                marts[json[1][1]] = json[1][0];
            })
            .catch(err => {
                console.log("there is a problem: " + err.message);
            });
            //작년 미국 소매지수 가져오기
            fetch(`http://api.census.gov/data/timeseries/eits/marts?get=cell_value&time=${dateForCensus(lastYear, months[v])}&time_slot_id&error_data&seasonally_adj=yes&category_code=44X72&data_type_code=SM&for=us:*&key=${censusKey}`)
            .then(checkApi)
            .then(response => {
                return response.json();
            })
            .then(json => {
                //날짜 : 당월 소매지수 데이터 꼴로 객체에 저장.
                marts[json[1][1]] = json[1][0];
            })
            .catch(err => {
                console.log("there is a problem: " + err.message);
            });
        }
        //전년 동기 대비 미국 소매 판매지수 변화량 구하기
        let yoy= [];
        for(let h=0; h < months.length; h++){
            let thisYearMarts = marts[dateForCensus(year, months[h])];
            let lastYearMarts = marts[dateForCensus(lastYear, months[h])];
            let yoyMarts= thisYearMarts / lastYearMarts - 1;
            yoy.push(yoyMarts);
        }
        //위에서 구한것의 3개월 평균. 총 4개 원소
        let avr3= [];
        for(let t=0; t < 4; t++){
            let nowAvr= (yoy[t] + yoy[t+1] + yoy[t+2]) / 3;
            avr3.push(nowAvr);
        }
        //위에서 구한것이 3개월 연속 같은 방향성인지 확인.
        function toward(a){
            return avr3[a]/avr3[a+1] - 1;
        }
        if((toward(0) > 0 && toward(1) > 0 && toward(2) > 0) || (toward(0) < 0 && toward(1) < 0 && toward(2) < 0)){
            //ism pmi지수 3개월치 계산. puppeteer이 속도 늦추기 때문에, 애초에 미국 소매 판매지수 만족 안하면 실행 안하게 설계
            (async () => {
            const browser = await puppeteer.launch({
                executablePath: 'C:/Program Files/Google/Chrome/Application/대충 브레이브 브라우저.exe' 
            });
            const page = await browser.newPage();

            await page.goto('https://kr.investing.com/economic-calendar/ism-manufacturing-pmi-173');

            // Wait and click '더 보여주기' -> 작년 pmi 지수 추출
            const searchResultSelector = '#showMoreHistory173';
            await page.waitForSelector(searchResultSelector);
            await page.click(searchResultSelector);
            //2번 누르기
            await page.waitForSelector(searchResultSelector);
            await page.click(searchResultSelector);
            //3번 누르기
            await page.waitForSelector(searchResultSelector);
            await page.click(searchResultSelector);

            await page.waitForSelector('.noWrap');
            //pmi 지수 전부 가져오기
            const tableList= await page.$$('.noWrap');
            //올해 pmi. 내림차순
            let thisPmi= [];
            //1년 전 pmi
            let lastPmi= [];
            //가장 최신 pmi가 발표 안된 일정일 경우. '\u00A0' = &nbsp;
            if(await tableList[0].evaluate(el => el.textContent) === '\u00A0'){
                for(let l= 0; l < 7; l++){
                    let smallPmi= await tableList[2*l + 2].evaluate(el => el.textContent); 
                    thisPmi.push(smallPmi);
                    let lastSmallPmi= await tableList[2*l + 2 + 24].evaluate(el => el.textContent);
                    lastPmi.push(lastSmallPmi); 
                }
            }else{
                for(let l= 0; l < 7; l++){
                    let smallPmi= await tableList[2*l].evaluate(el => el.textContent); 
                    thisPmi.push(smallPmi);
                    let lastSmallPmi= await tableList[2*l + 24].evaluate(el => el.textContent);
                    lastPmi.push(lastSmallPmi); 
                }
            };
            //puppeteer 종료
            await browser.close();

            //전년 대비 변화율 -> thisPmi 
            for(let m= 0; m < 7; m++){
                thisPmi[m]= parseFloat(thisPmi[m]) / parseFloat(lastPmi[m]) - 1.0;
            }
            //위의 3개월 평균. 4개 원소
            let avr3Pmi= [];
            for(let y=0; y < 4; y++){
                let avrP= (thisPmi[y] + thisPmi[y+1] + thisPmi[y+2]) / 3;
                avr3Pmi.push(avrP);
            }
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
            if((toward(0) > 0 && toward(1) > 0 && toward(2) > 0) && (towardPmi(0) > 0 && towardPmi(1) > 0 && towardPmi(2) > 0)){
                //공격자산
                //ETF의 ISIN 코드.(KODEX 200TR, TIGER 차이나CSI300, KODEX 미국S&P 500(H))
                let attackAssets= ["KR7278530001", "KR7192090009", "KR7449180009"];
                for(let x=0; x < attackAssets.length; x++){
                    //etf 정보 api 불러오기
                    //서비스키 둘 중에 하나 아직 확정 안남. 테스트 필요.
                    let summonETF= "serviceKey=" + portalKey + "&" + resultType + beginBasDt + endBasDt + "isinCd=" + attackAssets[x];

                    fetch("https://apis.data.go.kr/1160100/service/GetSecuritiesProductInfoService/getETFPriceInfo?" + summonETF)
                    .then(checkApi)
                    .then(response => {
                        return response.json();})
                    .then(json => {
                        let nowPrice= parseInt(json.response.body.items.item[0].clpr);  //공공데이터 포털 참고. 당일 종가
                        let ma200 = 0; //200일 단순이동평균 (지수이동평균 아님.)
                        for(let i= 0; i < 200; i++){
                            ma200 += parseInt(json.response.body.items.item[i].clpr);
                            //200 영업일의 종가를 전부 더한다.
                        }
                        ma200= ma200 / 200; //그걸 200으로 나누면 단순이동평균 완성.
                        let st_momentum= nowPrice / ma200; //현재 종가/200일 이평 
                    })
                    .catch(err => {
                        console.log("there is a problem: " + err.message);
                    });
                };
                //위의 fetch를 공격자산에 대하여 총 3번 반복.
            }else if((toward(0) < 0 && toward(1) < 0 && toward(2) < 0) && (towardPmi(0) < 0 && towardPmi(1) < 0 && towardPmi(2) < 0)){
                //안전자산
                //ETF의 ISIN 코드. 추후 sql db를 활용할 예정.
                let protectAssets= [
                    {ETFname: 'ACE_국고채10년', isin: 'KR7365780006'},
                    {ETFname: 'KODEX_국고채_30년액티브', isin:'KR7439870007'},
                    {ETFname: 'TIGER_단기선진하이일드_합성H', isin:'KR7182490003'},
                    {ETFname: 'KODEX_단기채권_plus', isin:'KR7214980005'},
                    {ETFname: 'TIGER_단기통안채', isin:'KR7157450008'},
                    {ETFname: 'KBSTAR_중기우량회사채', isin:'KR7136340007'},
                    {ETFname: 'ARIRANG_미국단기우량회사채', isin:'KR7332610005'},
                    {ETFname: 'SOL_국고채_3년', isin:'KR7438560005'},
                    {ETFname: 'ARIRANG_미국장기우량회사채', isin:'KR7332620004'}
                ];
                //오늘부터 6개월 전
                if(parseInt(month) - 6 <= 0){
                    let sixMonth= ('0' + (12 + month - 6)).slice(-2);
                    lastToday= lastYear + sixMonth + day;
                }else{
                    let sixMonth= ('0' + (month - 6)).slice(-2);
                    lastToday= year + sixMonth + day;
                }

                beginBasDt=`beginBasDt=${lastToday}&`;
                for(let x= 0; x < protectAssets.length; x++){
                    //etf 정보 api 불러오기
                    //서비스키 encoding ver
                    let summonETF= "serviceKey=" + portalKey + "&" + resultType + beginBasDt + endBasDt + "isinCd=" + protectAssets[x].isin;

                    fetch("https://apis.data.go.kr/1160100/service/GetSecuritiesProductInfoService/getETFPriceInfo?" + summonETF)
                    .then(checkApi)
                    .then(response => {
                        return response.json();})
                    .then(json => {
                        let nowPrice= parseInt(json.response.body.items.item[0].clpr);  //공공데이터 포털 참고. 당일 종가
                        //6개월 전 종가
                        let sixMonthPrice= parseInt(json.response.body.items.item[parseInt(json.response.body.totalCount) - 1].clpr);
                        protectAssets[x]['profit']= nowPrice / sixMonthPrice - 1;
                    })
                    .catch(err => {
                        console.log("there is a problem: " + err.message);
                    });
                };
                //수익률 높은 순으로 내림차순 배열
                protectAssets.sort((a, b) => b['profit'] - a['profit']);
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
            };
            })();
        }
        else{
            fs.readFile(__dirname + '/index.html', 'utf8', (err, data) => {
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
        }
    };
});

app.listen(3000, () =>{
    console.log('activating localhost 3000');
});