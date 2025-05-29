const API_KEY = 'i7SNR4PCjuSPhvZRkagJAQjLRaZUC2aF';
let lastTicker = ''

// 1. FMP API에서 3년치 재무 데이터 불러오기
async function fetchFinancialData(ticker) {
    const [incomeRes, balanceRes] = await Promise.all([
        fetch(`https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=3&apikey=${API_KEY}`),
        fetch(`https://financialmodelingprep.com/api/v3/balance-sheet-statement/${ticker}?limit=3&apikey=${API_KEY}`)
    ]);
    const income = await incomeRes.json();
    const balance = await balanceRes.json();

    if (!income.length || !balance.length) {
        throw new Error("해당 티커는 재무제표를 제공하지 않거나 최소한의 분석을 위한 데이터가 부족합니다.");
    }

    // 최근~과거 순서, 항목별 트렌드 추출
    const trends = {
        capital: [], // 자본효율(ROE)
        asset: [],   // 자산활용(ROA)
        debt: [],    // 부채비율
        sales: [],   // 매출성장률
        profit: [],  // 순이익률
        eps: [],     // 주당순이익
        price: [],   // 주가 적정성(PER)
        value: []    // 기업가치(PBR)
    };
    for (let i = 0; i < income.length && i < balance.length; i++) {
        const inc = income[i], bal = balance[i];
        // 자본효율성
        const capital = bal.totalStockholdersEquity ? (inc.netIncome / bal.totalStockholdersEquity) * 100 : null;
        // 자산활용
        const asset = bal.totalAssets ? (inc.netIncome / bal.totalAssets) * 100 : null;
        // 부채비율
        const debt = bal.totalStockholdersEquity ? (bal.totalLiabilities / bal.totalStockholdersEquity) * 100 : null;
        // 매출성장률
        const sales = i < income.length - 1 && income[i + 1].revenue
            ? ((inc.revenue - income[i + 1].revenue) / income[i + 1].revenue) * 100 : null;
        // 순이익률
        const profit = inc.revenue ? (inc.netIncome / inc.revenue) * 100 : null;
        // EPS
        const eps = inc.eps;
        // PER
        const price = inc.eps > 0 ? inc.weightedAverageShsOut ? (inc.revenue / inc.weightedAverageShsOut) / inc.eps : null : null;
        // PBR
        const value = bal.totalStockholdersEquity && inc.weightedAverageShsOut
            ? (bal.totalStockholdersEquity / inc.weightedAverageShsOut) / (inc.eps || 1) : null;

        trends.capital.push(capital ? capital.toFixed(2) * 1 : null);
        trends.asset.push(asset ? asset.toFixed(2) * 1 : null);
        trends.debt.push(debt ? debt.toFixed(2) * 1 : null);
        trends.sales.push(sales !== null ? sales.toFixed(2) * 1 : null);
        trends.profit.push(profit ? profit.toFixed(2) * 1 : null);
        trends.eps.push(eps ? eps * 1 : null);
        trends.price.push(price ? price.toFixed(2) * 1 : null);
        trends.value.push(value ? value.toFixed(2) * 1 : null);
    }
    return trends;
}

// 2. 항목별 점수/코멘트 (2문장, 쉬운말, ~다, 존댓말, 용어X, 예외처리)
function scoreCapital(val) {
    if (val == null) return 0;
    if (val >= 18) return 10;
    if (val >= 15) return 8;
    if (val >= 10) return 6;
    if (val >= 5) return 4;
    return 1;
}
function commentCapital(val, diff, trend) {
    if (!trend || trend.filter(x => x != null).length < 2)
        return "최근 재무 데이터가 부족하여 추세를 정확히 분석하기 어렵습니다. 투자 판단 시 주의해 주시기 바랍니다.";
    if (val >= 18 && diff > 0) 
        return "이 회사는 투자받은 자금을 매우 효과적으로 운영하고 있습니다. 자본을 잘 활용해 경영 성과가 꾸준히 개선되고 있습니다.";
    if (val >= 15)
        return "회사가 투자 자금을 효과적으로 활용하고 있습니다. 경영진이 자본을 안정적으로 관리하고 있습니다.";
    if (val < 10 && diff < 0)
        return "자본을 충분히 활용하지 못해 이익이 늘지 않고 있습니다. 경영 효율성 개선이 필요해 보입니다.";
    if (diff > 0)
        return "회사가 자본을 점점 더 잘 활용하고 있습니다. 최근 경영 성과가 나아지고 있습니다.";
    if (diff < 0)
        return "자본 활용 능력이 다소 떨어지고 있습니다. 추가적인 관리가 필요해 보입니다.";
    return "자본을 무난하게 활용하고 있습니다. 경영 성과는 평균적인 수준입니다.";
}

function scoreAsset(val) {
    if (val == null) return 0;
    if (val >= 8) return 10;
    if (val >= 6) return 8;
    if (val >= 4) return 6;
    if (val >= 2) return 4;
    return 1;
}
function commentAsset(val, diff, trend) {
    if (!trend || trend.filter(x => x != null).length < 2)
        return "최근 자산 관련 데이터가 충분하지 않습니다. 자산 운용 추이를 파악하기 어렵습니다.";
    if (val >= 8)
        return "회사가 보유한 자산을 적극적으로 활용하여 이익을 내고 있습니다. 자산 관리가 매우 효율적으로 이루어지고 있습니다.";
    if (val >= 6)
        return "자산을 효과적으로 활용하고 있습니다. 전반적으로 자산 운영이 잘 되고 있습니다.";
    if (diff > 0)
        return "자산을 점차 더 잘 활용하고 있습니다. 자산 운용 능력이 개선되고 있습니다.";
    if (diff < 0)
        return "최근 자산 활용 능력이 다소 저하되고 있습니다. 효율성 제고가 필요합니다.";
    return "자산을 활용하는 데 아쉬움이 있습니다. 자산 운용 효율을 높여야 할 것 같습니다.";
}

function scoreDebt(val) {
    if (val == null) return 0;
    if (val < 40) return 10;
    if (val < 70) return 8;
    if (val < 100) return 6;
    if (val < 150) return 4;
    return 1;
}
function commentDebt(val, diff, trend) {
    if (!trend || trend.filter(x => x != null).length < 2)
        return "부채 관련 데이터가 충분하지 않아 분석에 한계가 있습니다. 재무 건전성 판단 시 주의해 주시기 바랍니다.";
    if (val < 40)
        return "회사가 빚이 많지 않아 재무적으로 매우 안정적입니다. 앞으로도 부담 없이 경영을 이어갈 수 있을 것 같습니다.";
    if (val < 70)
        return "부채 부담이 크지 않아 안정적인 경영이 기대됩니다. 재무 상태가 양호한 편입니다.";
    if (val < 150)
        return "부채가 다소 있으나 관리 가능한 수준입니다. 부채 관리에 신경을 쓰고 있는 것으로 보입니다.";
    return "부채가 많아 재무적인 위험이 존재합니다. 추가적인 부채 관리가 필요해 보입니다.";
}

function scoreSales(val) {
    if (val == null) return 0;
    if (val >= 15) return 10;
    if (val >= 10) return 8;
    if (val >= 5) return 6;
    if (val >= 0) return 4;
    return 1;
}
function commentSales(val, diff, trend) {
    if (!trend || trend.filter(x => x != null).length < 2)
        return "매출 관련 데이터가 부족하여 추세를 알기 어렵습니다. 사업 성장성 분석에 주의가 필요합니다.";
    if (val >= 15)
        return "회사의 매출이 빠르게 늘어나고 있습니다. 사업 확장과 성장 가능성이 높아 보입니다.";
    if (val >= 10)
        return "매출이 꾸준히 증가하고 있습니다. 사업이 안정적으로 성장하고 있습니다.";
    if (diff > 0)
        return "매출이 최근 들어 더욱 늘어나고 있습니다. 성장세가 이어지고 있습니다.";
    if (diff < 0)
        return "매출 증가세가 약해지고 있습니다. 사업 성장 동력이 다소 부족해 보입니다.";
    return "매출이 정체되어 성장성이 제한적입니다. 사업 확장에 더 많은 노력이 필요합니다.";
}

function scoreProfit(val) {
    if (val == null) return 0;
    if (val >= 15) return 10;
    if (val >= 10) return 8;
    if (val >= 5) return 6;
    if (val >= 0) return 4;
    return 1;
}
function commentProfit(val, diff, trend) {
    if (!trend || trend.filter(x => x != null).length < 2)
        return "이익 관련 데이터가 부족하여 분석에 제약이 있습니다. 수익성 판단 시 신중하셔야 합니다.";
    if (val >= 15)
        return "제품과 서비스에서 충분한 이익을 내고 있습니다. 수익 구조가 매우 안정적으로 유지되고 있습니다.";
    if (val >= 10)
        return "회사의 이익이 안정적으로 유지되고 있습니다. 수익성이 좋은 편입니다.";
    if (diff > 0)
        return "이익이 최근 들어 증가하고 있습니다. 수익성이 개선되고 있습니다.";
    if (diff < 0)
        return "이익이 줄어들고 있어 수익성이 약화되고 있습니다. 비용 관리가 필요합니다.";
    return "이익이 정체되어 수익성에 아쉬움이 있습니다. 추가적인 개선 노력이 필요합니다.";
}

function scoreEPS(val) {
    if (val == null) return 0;
    if (val > 0) return 10;
    return 1;
}
function commentEPS(val, diff, trend) {
    if (!trend || trend.filter(x => x != null).length < 2)
        return "주주가치에 관한 데이터가 부족하여 분석이 어렵습니다. 수익성 평가에 유의해야 합니다.";
    if (val > 0 && diff > 0)
        return "주주에게 돌아가는 이익이 꾸준히 늘고 있습니다. 회사가 주주 가치를 잘 지키고 있습니다.";
    if (val > 0)
        return "주주에게 돌아가는 이익이 유지되고 있습니다. 안정적인 수익 창출이 이루어지고 있습니다.";
    return "주주에게 돌아가는 이익이 줄고 있습니다. 수익 창출 능력 개선이 필요합니다.";
}

function scorePrice(val) {
    if (val == null) return 0;
    if (val < 15 && val > 7) return 10;
    if (val < 20) return 8;
    return 4;
}
function commentPrice(val, diff, trend) {
    if (!trend || trend.filter(x => x != null).length < 2)
        return "주가에 대한 데이터가 부족해 평가가 어렵습니다. 투자 결정 시 참고하시기 바랍니다.";
    if (val < 15)
        return "현재 주식 가격이 적절하게 평가되어 있습니다. 시장에서 회사의 가치를 긍정적으로 보고 있습니다.";
    return "주식 가격이 실제 가치에 비해 다소 높게 평가되고 있습니다. 투자 결정에 신중을 기하시기 바랍니다.";
}

function scoreValue(val) {
    if (val == null) return 0;
    if (val < 2) return 10;
    if (val < 3) return 7;
    return 4;
}
function commentValue(val, diff, trend) {
    if (!trend || trend.filter(x => x != null).length < 2)
        return "기업 가치에 관한 데이터가 부족해 분석이 어렵습니다. 투자 전 충분한 검토가 필요합니다.";
    if (val < 2)
        return "회사의 자산 가치가 주가에 잘 반영되어 있습니다. 비교적 안정적인 투자 대상으로 볼 수 있습니다.";
    return "자산 가치에 비해 주가가 높게 형성되어 있습니다. 투자 전 신중한 검토가 필요합니다.";
}

// 3. 항목별 분석/점수화/코멘트
function makeReport(trends) {
    const itemDefs = [
        {
            name: "자본 효율성",
            trend: trends.capital.slice().reverse(),
            score: v => scoreCapital(v),
            comment: (v, d, t) => commentCapital(v, d, t)
        },
        {
            name: "자산 활용",
            trend: trends.asset.slice().reverse(),
            score: v => scoreAsset(v),
            comment: (v, d, t) => commentAsset(v, d, t)
        },
        {
            name: "재무 안정성",
            trend: trends.debt.slice().reverse(),
            score: v => scoreDebt(v),
            comment: (v, d, t) => commentDebt(v, d, t)
        },
        {
            name: "매출 성장",
            trend: trends.sales.slice().reverse(),
            score: v => scoreSales(v),
            comment: (v, d, t) => commentSales(v, d, t)
        },
        {
            name: "이익률",
            trend: trends.profit.slice().reverse(),
            score: v => scoreProfit(v),
            comment: (v, d, t) => commentProfit(v, d, t)
        },
        {
            name: "주주 가치",
            trend: trends.eps.slice().reverse(),
            score: v => scoreEPS(v),
            comment: (v, d, t) => commentEPS(v, d, t)
        },
        {
            name: "주가 적정성",
            trend: trends.price.slice().reverse(),
            score: v => scorePrice(v),
            comment: (v, d, t) => commentPrice(v, d, t)
        },
        {
            name: "기업 가치",
            trend: trends.value.slice().reverse(),
            score: v => scoreValue(v),
            comment: (v, d, t) => commentValue(v, d, t)
        }
    ];

    // 점수/코멘트/트렌드 추출, 데이터 충분한 항목만 유효
    const itemResults = itemDefs.map(item => {
        const t = item.trend;
        const validTrend = t.filter(x => x != null);
        const val = t[t.length-1], prev = t[t.length-2];
        const diff = (val != null && prev != null) ? val - prev : 0;
        const score = validTrend.length < 2 ? 0 : item.score(val);
        return {
            name: item.name,
            comment: item.comment(val, diff, validTrend),
            trend: validTrend,
            score: score
        };
    });
    // 데이터 2개 이상인 항목만 점수 환산
    const validScores = itemResults.filter(x => x.trend.length >= 2);
    let total = 0, maxScore = 0;
    validScores.forEach((x, i) => {
        const idx = itemResults.findIndex(xx => xx.name === x.name);
        total += itemDefs[idx].score(x.trend.slice(-1)[0]);
        maxScore += 10;
    });
    const finalScore = maxScore ? Math.round((total / maxScore) * 100) : 0;

    // 종합요약 (심플 예시)
    let summary;
    if (finalScore >= 90) summary = [
        "재무 상태와 성장성이 매우 우수합니다. 각 항목에서 꾸준히 좋은 평가를 받고 있습니다.",
        "시장에서도 이 회사를 높게 평가하고 있습니다. 장기 투자에 매우 적합하다고 판단됩니다.",
        "이익과 매출이 꾸준히 증가하는 추세입니다. 사업 확장과 주주가치도 뛰어납니다.",
        "재무적으로도 위험요인이 거의 없다고 볼 수 있습니다."
    ];
    else if (finalScore >= 80) summary = [
        "대부분의 재무 항목에서 좋은 결과를 보이고 있습니다. 안정적인 투자 환경을 기대할 수 있습니다.",
        "매출과 이익이 꾸준히 늘어나고 있습니다. 사업 성장성도 양호한 편입니다.",
        "경영진이 재무를 효과적으로 관리하고 있습니다.",
        "장기 투자에 적합하다고 볼 수 있습니다."
    ];
    else if (finalScore >= 70) summary = [
        "재무 상태가 전체적으로 무난한 편입니다. 몇몇 항목에서는 추가 개선이 필요합니다.",
        "매출과 이익 성장세가 유지되고 있습니다.",
        "일부 리스크 신호가 있으므로 투자 전 추가적인 분석을 권장합니다.",
        "지속적인 관심이 필요합니다."
    ];
    else if (finalScore >= 60) summary = [
        "여러 항목에서 위험 신호가 감지됩니다. 성장성과 재무 안정성에 개선이 필요합니다.",
        "매출, 이익 변동성이 커 신중한 투자가 요구됩니다.",
        "추가적인 경영 개선이 이뤄져야 할 것 같습니다.",
        "투자를 고려하실 때 각별한 주의가 필요합니다."
    ];
    else summary = [
        "재무 상태와 성장성에서 취약점이 큽니다. 전반적으로 투자 위험이 높은 편입니다.",
        "부채 비율 등에서 불안 요인이 나타나고 있습니다.",
        "매출과 이익이 감소하는 추세입니다.",
        "장기 투자에는 적합하지 않다고 판단됩니다."
    ];

    return {
        score: finalScore,
        summary,
        items: itemResults,
        itemCount: validScores.length // 유효 항목 개수
    };
}

// 4. 점수별 추천 코멘트
function getRecommendComment(score) {
    if (score >= 90) {
        return { text: "재무 상태와 성장성이 모두 우수합니다. 장기 투자에 매우 적합하다고 판단됩니다.", class: "" };
    } else if (score >= 80) {
        return { text: "대부분의 항목에서 좋은 평가를 받고 있습니다. 장기 투자에 적합하다고 볼 수 있습니다.", class: "" };
    } else if (score >= 70) {
        return { text: "전반적으로 무난하지만 일부 주의가 필요합니다. 매수 전 추가적인 분석을 권장합니다.", class: "warn" };
    } else if (score >= 60) {
        return { text: "위험 신호가 보이므로 신중한 접근이 필요합니다. 투자를 고려하실 때 주의하시기 바랍니다.", class: "warn" };
    } else {
        return { text: "재무 상태와 성장성에서 취약점이 큽니다. 장기 투자에는 적합하지 않다고 판단됩니다.", class: "danger" };
    }
}

// 5. UI 갱신
let scoreGauge;
function drawGauge(score) {
    const ctx = document.getElementById('scoreGauge').getContext('2d');
    if (scoreGauge) scoreGauge.destroy();
    scoreGauge = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [score, 100-score],
                backgroundColor: [
                    score >= 90 ? "#44ca6b" : score >= 80 ? "#49b6ed" : score >= 60 ? "#ffe066" : "#fc5454",
                    "#e7e7e7"
                ],
                borderWidth: 0,
                cutout: "70%"
            }]
        },
        options: {
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
    // 중앙 점수 표시 (span)
    document.getElementById('scoreGauge-label').innerText = score;
}

function drawSummary(summary, alertMsg) {
    document.getElementById('summary-comment').innerHTML =
        (alertMsg || "") + summary.map(line => `<div>${line}</div>`).join("");
}
function drawItemComments(items) {
    const box = document.getElementById('item-comments');
    box.innerHTML = "";
    items.forEach(item => {
        box.innerHTML += `<div class="item-comment"><b>${item.name}:</b> ${item.comment}</div>`;
    });
}
function drawMiniCharts(items) {
    const miniBox = document.getElementById('mini-charts');
    miniBox.innerHTML = "";
    items.forEach((item, idx) => {
        const validTrend = item.trend.filter(x => x != null);
        const idLine = `mini-chart-line-${idx}`;
        miniBox.innerHTML += `
            <div class="mini-chart-block">
                <div class="mini-chart-title">${item.name}</div>
                ${
                  validTrend.length < 2
                  ? `<div style="color:#bbb;font-size:0.98em;">데이터 부족</div>`
                  : `<canvas id="${idLine}" width="90" height="45"></canvas>`
                }
            </div>`;
        if (validTrend.length >= 2) {
            // 라벨 자동
            const labels = [];
            for(let i = validTrend.length - 1; i >= 0; i--) {
                if (i === validTrend.length - 1) labels.unshift("최근");
                else if (i === validTrend.length - 2) labels.unshift("작년");
                else labels.unshift(`${validTrend.length - 1 - i}년전`);
            }
            setTimeout(() => {
    const ctx = document.getElementById(idLine).getContext('2d');
    // 그라데이션 배경
    const gradient = ctx.createLinearGradient(0, 0, 0, 45);
    gradient.addColorStop(0, "rgba(51,121,186,0.20)");
    gradient.addColorStop(1, "rgba(51,121,186,0.02)");

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: validTrend,
                borderColor: "#3171d5",
                backgroundColor: gradient,
                tension: 0.40,
                pointRadius: 4,
                pointBorderWidth: 2,
                pointBackgroundColor: "#fff",
                pointBorderColor: "#3171d5",
                fill: true,
                borderWidth: 3,
            }]
        },
        options: {
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            elements: {
                line: { borderWidth: 3, borderCapStyle: 'round' },
                point: {
                    radius: 4,
                    borderWidth: 2,
                    backgroundColor: "#fff",
                    borderColor: "#3171d5"
                }
            },
            scales: {
                x: { display: false },
                y: { display: false }
            },
            responsive: false,
            maintainAspectRatio: false,
            animation: {
                duration: 1400,
                easing: 'easeOutQuart'
            }
        }
    });
}, 10);

        }
    });
}




function updateReport(data, ticker) {
    drawGauge(data.score);
    document.getElementById("score-label").innerText = `종합점수`;

    // 티커+조회시간 안내문구
    const now = new Date();
    const yyyy = now.getFullYear();
    const MM = ("0"+(now.getMonth()+1)).slice(-2);
    const dd = ("0"+now.getDate()).slice(-2);
    const HH = ("0"+now.getHours()).slice(-2);
    const mm = ("0"+now.getMinutes()).slice(-2);
    const ss = ("0"+now.getSeconds()).slice(-2);
    const datestr = `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;

    document.getElementById("score-meta").innerHTML =
      `<span style="color:#1c3765;">${ticker.toUpperCase()}에 대한 분석 결과입니다.<br>조회일시: ${datestr} 기준입니다.</span>`;

    // 매수 추천 코멘트
    const recommend = getRecommendComment(data.score);
    document.getElementById("score-recommend").className = "recommend-box" + (recommend.class ? " " + recommend.class : "");
    document.getElementById("score-recommend").innerText = recommend.text;

    // 안내 문구: 데이터 부족/신뢰도
    let alertMsg = "";
    if (data.itemCount <= 2) {
        alertMsg = `<div style="color:#dc3545;font-weight:bold;padding:4px 0 7px 0;">
        데이터가 너무 적어 신뢰할 수 있는 종합 분석이 어렵습니다.</div>`;
    } else if (data.itemCount < 8) {
        alertMsg = `<div style="color:#f39000;font-weight:bold;padding:4px 0 7px 0;">
        분석에 사용된 재무 데이터가 일부 항목에서 부족합니다. 결과 해석에 주의가 필요합니다.</div>`;
    }
    drawSummary(data.summary, alertMsg);
    drawItemComments(data.items);
    drawMiniCharts(data.items);
}

// 6. 이벤트 핸들러/초기화
document.getElementById('search-form').addEventListener('submit', async function(e){

    // 👉 환영 일러스트 숨기기
    document.getElementById('welcome-visual').style.display = "none";

    // 👉 결과 영역(card-section, details-section 등) 표시(숨김 해제)
    document.querySelector('.card-section').style.display = "flex";
    document.querySelector('.details-section').style.display = "block";

    e.preventDefault();
    const ticker = document.getElementById('ticker-input').value.trim().toUpperCase();
    lastTicker = ticker;
    document.getElementById("score-label").innerText = "";
    document.getElementById("score-meta").innerHTML = "";
    document.getElementById("score-recommend").innerHTML = "";
    document.getElementById('summary-comment').innerHTML = "조회 중...";
    document.getElementById('item-comments').innerHTML = "";
    document.getElementById('mini-charts').innerHTML = "";
    try {
        const trends = await fetchFinancialData(ticker);
        const report = makeReport(trends);
        updateReport(report, ticker);
        // 분석 함수 마지막에
        //showPdfButton();

    } catch (err) {
        document.getElementById('summary-comment').innerHTML = `<span style="color:red;">${err.message}</span>`;
        document.getElementById("score-meta").innerHTML = "";
        document.getElementById("score-recommend").innerHTML = "";
    }
});


window.onload = () => {
    // 환영 일러스트만 보여주고 결과 영역 숨김
    document.getElementById('welcome-visual').style.display = "flex";
    document.querySelector('.card-section').style.display = "none";
    document.querySelector('.details-section').style.display = "none";
};

// 1) 분석 성공(데이터 표시) 후 아래 함수를 호출
// function showPdfButton() {
//     document.getElementById('pdf-download-btn').style.display = "block";
// }

// document.getElementById('pdf-download-btn').addEventListener('click', function () {
//     // 1. card-section, details-section 복사

//     const content = document.createElement('div');
//     content.append(
//       document.querySelector('.card-section').cloneNode(true),
//       document.querySelector('.details-section').cloneNode(true)
//     );

//     // 2. 복제된 content 내의 모든 canvas → 이미지로 변환
//     const canvases = document.querySelectorAll('.card-section canvas, .details-section canvas');
//     const clones = content.querySelectorAll('canvas');
//     clones.forEach((canvas, i) => {
//         try {
//             // 캡처된 canvas의 이미지 data url로 img 대체
//             const img = document.createElement('img');
//             img.src = canvases[i].toDataURL('image/png');
//             img.style.maxWidth = canvas.style.width || canvas.width + 'px';
//             img.style.maxHeight = canvas.style.height || canvas.height + 'px';
//             img.style.display = "block";
//             img.style.margin = "0 auto 8px auto";
//             canvas.parentNode.replaceChild(img, canvas);
//         } catch(e) {
//             // 에러 무시
//         }
//     });

//     // 3. PDF 옵션
//     const tickerName = lastTicker ? lastTicker.toUpperCase() : "종목";
//     const opt = {
//       margin: 0.15,
//       filename: `${tickerName}_재무제표_분석결과.pdf`,
//       image: { type: 'jpeg', quality: 0.98 },
//       html2canvas: { scale: 2, useCORS: true },
//       jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
//     };
//     // 4. PDF로 저장
//     html2pdf().from(content).set(opt).save();
// });

// 1. 화면 블러 처리 함수
function blockPage() {
  // 1) 내용 흐리게(blur) 처리
  document.body.style.filter = "blur(7px)";
  // 2) 블록 오버레이 표시
  document.getElementById('block-overlay').style.display = "block";
  // 4) 강제 리다이렉트 (원한다면 주석 해제)
  location.href = "https://google.com"; // 또는 다른 사이트로 강제 이동
}

// 2. 우클릭/F12/소스보기 단축키 등 방지
document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
document.addEventListener('keydown', function(e) {
  if (e.key === "F12") e.preventDefault();
  if (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "i")) e.preventDefault();
  if (e.ctrlKey && (e.key === "U" || e.key === "u")) e.preventDefault();
});

// 3. 개발자도구 열림 감지 후 바로 차단
(function() {
  let blocked = false;
  const threshold = 160;
  setInterval(function() {
    if (
      window.outerWidth - window.innerWidth > threshold ||
      window.outerHeight - window.innerHeight > threshold
    ) {
      if (!blocked) {
        location.href = "https://google.com"; // 또는 다른 사이트로 강제 이동
        
        blockPage();
        blocked = true;
      }
    } else {
      blocked = false;
    }
  }, 800);
})();

// 4. 스크립트 비활성화 감지는 <noscript>에서 처리 (위 html 참고)
