//this project is using ES Module
import express from 'express';
const app= express();
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
            if(month - z - 1 <= 0){
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

            // Locate the full title with a unique string
            const textSelector = await page.waitForSelector(
                'text/Customize and automate'
            );
            const fullTitle = await textSelector?.evaluate(el => el.textContent);

            // Print the full title
            console.log('The title of this blog post is "%s".', fullTitle);

            await browser.close();
            })();
        }
        else{
            //현 포지션 유지
        }
    };
});

app.listen(3000);