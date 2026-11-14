
'use strict';
const ICONS={"wallet": "<path d=\"M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v11H6a3 3 0 0 1-3-3V6\"/><path d=\"M20 12h-5v4h5\"/>", "overview": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/>", "transactions": "<path d=\"M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4\"/>", "goals": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/>", "budgets": "<path d=\"M3 8h18v12H3zM3 8l3-5h12l3 5M8 12h8M12 8v12\"/>", "export": "<path d=\"M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5\"/>", "help": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 8a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01\"/>", "monitor": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"13\" rx=\"2\"/><path d=\"M12 16v5M8 21h8\"/>", "phone": "<rect x=\"7\" y=\"2\" width=\"10\" height=\"20\" rx=\"2\"/><path d=\"M11 18h2\"/>", "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5\"/>", "moon": "<path d=\"M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10z\"/>", "plus": "<path d=\"M12 5v14M5 12h14\"/>", "edit": "<path d=\"m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z\"/>", "delete": "<path d=\"M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7\"/>", "saving": "<path d=\"M12 3v18m4-14c-1-3-8-3-8 1s8 3 8 7-7 4-8 1\"/>", "income": "<path d=\"M12 20V4m-6 6 6-6 6 6M4 20h16\"/>", "spending": "<path d=\"M12 4v16m-6-6 6 6 6-6M4 4h16\"/>", "other": "<circle cx=\"5\" cy=\"12\" r=\"1\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/>", "check": "<path d=\"m5 12 4 4L19 6\"/>", "arrow": "<path d=\"M4 12h16m-6-6 6 6-6 6\"/>", "shield": "<path d=\"m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z\"/><path d=\"m8 12 3 3 5-6\"/>"};
function icon(name){return '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICONS[name]||ICONS.wallet)+'</svg>';}

const TYPES=['Spending','Saving','Income','Other'],TERMS=['Short-term','Mid-term','Long-term'],PURPOSES=['Savings','Purchasing','Lending'];
const MODES=['Money received','Money paid','Opening balance','Lending out','Lending repayment received','Borrowing received','Borrowing repayment paid'];
const IN=['Money received','Opening balance','Lending repayment received','Borrowing received'];
const KEY='ryus-ledger-personal-v4',SCHEMA='ryus-ledger-personal-v4',MAX=100000000000;
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
const fmtDate=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=()=>fmtDate(new Date()),nowMonth=()=>today().slice(0,7),norm=s=>s.trim().toLowerCase();
const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n/100);
const cents=s=>/^\d+(\.\d{1,2})?$/.test(String(s))?Math.round(Number(s)*100):NaN;
const amountOK=n=>Number.isSafeInteger(n)&&n>0&&n<=MAX;
function dateOK(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;}
const monthOK=s=>typeof s==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s)&&+s.slice(0,4)>=1900;
const sorted=rows=>[...rows].sort((a,b)=>a.date.localeCompare(b.date)||a.seq-b.seq);
const sum=(rows,fn)=>rows.filter(fn).reduce((n,r)=>n+r.cents,0);
const dir=r=>r.type==='Income'?'In':r.type==='Other'?(IN.includes(r.mode)?'In':'Out'):r.type==='Saving'?'Transfer':'Out';
const empty=()=>({records:[],goals:[],budgets:[]});
function balances(rows){let cash=0;const reserve=Object.create(null),contributed=Object.create(null),used=Object.create(null),repaid=Object.create(null),origins=Object.create(null);
 for(const r of sorted(rows)){const k=r.goalId||'general';
 if(r.type==='Other'&&['Lending repayment received','Borrowing repayment paid'].includes(r.mode)){const o=origins[r.loanId],want=r.mode==='Lending repayment received'?'Lending out':'Borrowing received';if(!o||o.mode!==want)throw Error('Repayment must link to an earlier matching principal record.');repaid[r.loanId]=(repaid[r.loanId]||0)+r.cents;if(repaid[r.loanId]>o.cents)throw Error('Repayment exceeds outstanding principal. Record interest separately as Income or Spending.');}
 if(r.type==='Income'||r.type==='Other'&&dir(r)==='In')cash+=r.cents;
 else if(r.type==='Saving'){cash-=r.cents;reserve[k]=(reserve[k]||0)+r.cents;contributed[k]=(contributed[k]||0)+r.cents;}
 else if(r.source==='Goal'||r.source==='Saving'){reserve[k]=(reserve[k]||0)-r.cents;used[k]=(used[k]||0)+r.cents;}
 else cash-=r.cents;
 if(cash<0)throw Error('Insufficient available cash on '+r.date+'. Record actual Income, Other → Opening balance, or borrowing first.');
 if(Object.values(reserve).some(n=>n<0))throw Error('Insufficient reserved saving on '+r.date+'. Record a Saving contribution first, or reduce the amount.');
 if(!Number.isSafeInteger(cash)||Object.values(reserve).some(n=>!Number.isSafeInteger(n)))throw Error('Balance exceeds the safe numeric limit.');
 if(r.type==='Other'&&['Lending out','Borrowing received'].includes(r.mode))origins[r.id]=r;
 }
 return {cash,reserve,contributed,used,repaid,origins,saved:Object.values(reserve).reduce((n,v)=>n+v,0),receivable:Object.values(origins).filter(r=>r.mode==='Lending out').reduce((n,r)=>n+r.cents-(repaid[r.id]||0),0),payable:Object.values(origins).filter(r=>r.mode==='Borrowing received').reduce((n,r)=>n+r.cents-(repaid[r.id]||0),0)};
}
function validate(x){
 if(!x||!Array.isArray(x.records)||!Array.isArray(x.goals)||!Array.isArray(x.budgets))throw Error('Invalid backup structure.');
 if(x.records.length>20000||x.goals.length>1000||x.budgets.length>5000)throw Error('This edition supports up to 20,000 transactions, 1,000 goals and 5,000 budgets.');
 const text=(v,n)=>typeof v==='string'&&v.length<=n;
 const ids=list=>{const seen=new Set();for(const v of list){if(!v||!text(v.id,100)||!v.id||!/^[A-Za-z0-9_-]+$/.test(v.id)||['__proto__','constructor','prototype','general'].includes(v.id)||seen.has(v.id))throw Error('Invalid or duplicate record IDs.');seen.add(v.id);}};
 ids(x.records);ids(x.goals);ids(x.budgets);
 for(const g of x.goals)if(!text(g.name,80)||!g.name.trim()||!TERMS.includes(g.term)||!PURPOSES.includes(g.purpose)||!dateOK(g.created)||!dateOK(g.targetDate)||g.targetDate<g.created||!text(g.category,80)||!g.category.trim()||!amountOK(g.target))throw Error('Invalid goal.');
 const seenBudgets=new Set();for(const b of x.budgets){if(!monthOK(b.month)||!text(b.category,80)||!b.category.trim()||!amountOK(b.limit))throw Error('Invalid budget.');const k=b.month+'|'+norm(b.category);if(seenBudgets.has(k))throw Error('Duplicate category budget in one month.');seenBudgets.add(k);}
 const seqs=new Set();for(const r of x.records){
 if(!TYPES.includes(r.type)||!dateOK(r.date)||r.date>today()||!amountOK(r.cents)||!Number.isSafeInteger(r.seq)||r.seq<1||seqs.has(r.seq)||!text(r.category,80)||!r.category.trim()||!text(r.note,300)||!text(r.goalId,100)||!text(r.loanId,100)||!['Cash','Goal','Saving'].includes(r.source)||!text(r.mode,60))throw Error('Invalid transaction.');seqs.add(r.seq);
 const g=x.goals.find(g=>g.id===r.goalId);if(r.goalId&&!g)throw Error('A transaction references a missing goal.');
 if(r.type==='Other'&&!MODES.includes(r.mode))throw Error('Invalid Other subtype.');
 if(r.type!=='Other'&&r.mode)throw Error('Unexpected transaction subtype.');
 const repay=r.type==='Other'&&['Lending repayment received','Borrowing repayment paid'].includes(r.mode);
 if(!repay&&r.loanId)throw Error('Unexpected loan reference.');
 if((r.type==='Income'||r.type==='Saving'||repay)&&r.source!=='Cash')throw Error('Income, Saving and repayments must use Cash.');
 if(r.source!=='Cash'&&!(r.type==='Spending'||r.type==='Other'&&r.mode==='Lending out'))throw Error('Saved funds can only fund Spending or Lending out.');
 if(r.source==='Goal'&&!g||r.source==='Saving'&&r.goalId)throw Error('Invalid saved-fund source.');
 if(r.goalId&&r.type!=='Saving'&&r.source!=='Goal')throw Error('Unexpected goal link.');
 if(g&&r.date<g.created)throw Error('Linked transaction predates the goal start date.');
 }
 balances(x.records);return x;
}
function budgetInfo(x,month){const before=balances(x.records.filter(r=>r.date<month+'-01')),rows=x.records.filter(r=>r.date.slice(0,7)===month),inflow=sum(rows,r=>dir(r)==='In'),saving=sum(rows,r=>r.type==='Saving'),otherOut=sum(rows,r=>r.type==='Other'&&dir(r)==='Out'&&r.source==='Cash'),funding=Math.max(0,before.cash+inflow-saving-otherOut),plans=x.budgets.filter(b=>b.month===month),spending=rows.filter(r=>r.type==='Spending'&&r.source==='Cash');return {opening:before.cash,inflow,saving,otherOut,funding,plans,allocated:plans.reduce((n,b)=>n+b.limit,0),spending,actual:sum(spending,()=>true),unbudgeted:sum(spending,r=>!plans.some(b=>norm(b.category)===norm(r.category)))};}
function clean(x){return {records:x.records.map(r=>Object.fromEntries(['id','seq','date','type','mode','source','goalId','loanId','category','note','cents'].map(k=>[k,r[k]]))),goals:x.goals.map(g=>Object.fromEntries(['id','name','term','purpose','created','targetDate','category','target'].map(k=>[k,g[k]]))),budgets:x.budgets.map(b=>Object.fromEntries(['id','month','category','limit'].map(k=>[k,b[k]])))};}
let db=empty(),revision='',saving=true,blocked=false,tab='Overview',editTx='',editGoal='',editBudget='',pending=null;
let txDraft={date:today(),type:'Income',mode:'Money received',source:'Cash',goalId:'',loanId:'',category:'',note:'',amount:''};
let goalDraft={name:'',term:'Short-term',purpose:'Savings',created:today(),when:'Date',years:'1',targetDate:'',category:'',amount:''};
let budgetDraft={category:'',amount:''},bm=nowMonth(),period='Month',periodMonth=nowMonth(),periodYear=today().slice(0,4),from='',to='',kind='All types',txSearch='';
function envelope(data,rev){return {schema:SCHEMA,version:4,currency:'INR',amountUnit:'paise',revision:rev,exportedAt:new Date().toISOString(),data};}
function status(s){$('#status').textContent=s;}
function storageWarning(s){$('#storageWarning').textContent=s;}
let signedIn=false,accountName='',accountEmail='',writeBusy=false;
async function commit(next,msg){if(writeBusy){status('A save is already in progress. Please wait.');return false;}try{if(!signedIn)throw Error('Sign in first.');validate(next);next=clean(next);writeBusy=true;const r=await window.desktop.save({data:next,revision});revision=r.revision;db=next;status(msg);render();return true;}catch(e){status('Not saved: '+e.message);return false;}finally{writeBusy=false;}}
function confirmAction(title,text,fn){$('#confirmTitle').textContent=title;$('#confirmText').textContent=text;$('#confirmYes').onclick=()=>{$('#confirm').close();fn();};$('#confirm').showModal();}
$('#confirmNo').onclick=()=>$('#confirm').close();
function nav(t){if(t!==tab&&$('#txForm'))txDraft={...txDraft,...formData('txForm')};if($('#goalForm'))goalDraft={...goalDraft,...formData('goalForm')};if($('#budgetForm'))budgetDraft={...budgetDraft,...formData('budgetForm')};tab=t;status('');render();window.scrollTo({top:0,behavior:'instant'});}
const opts=(list,value,placeholder)=> (placeholder!==undefined?'<option value="">'+esc(placeholder)+'</option>':'')+list.map(v=>{const [val,label]=Array.isArray(v)?v:[v,v];return '<option value="'+esc(val)+'"'+(String(val)===String(value)?' selected':'')+'>'+esc(label)+'</option>';}).join('');
const input=(name,label,value,type='text',extra='')=>'<label>'+esc(label)+'<input name="'+name+'" id="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
const select=(name,label,list,value,placeholder)=>'<label>'+esc(label)+'<select name="'+name+'" id="'+name+'">'+opts(list,value,placeholder)+'</select></label>';
const button=(action,label,extra='')=>'<button type="button" data-action="'+action+'" '+extra+'>'+label+'</button>';
const stats=items=>'<div class="stats">'+items.map(([label,n,note])=>'<div class="stat"><span>'+esc(label)+'</span><strong>'+money(n)+'</strong>'+(note?'<small>'+esc(note)+'</small>':'')+'</div>').join('')+'</div>';
const progress=(n,max)=>'<progress aria-label="Progress" value="'+Math.min(n,max)+'" max="'+(max||1)+'"></progress>';
const goalName=k=>db.goals.find(g=>g.id===k)?.name||'General saving';
const formData=id=>Object.fromEntries(new FormData(document.getElementById(id)).entries());
function periodData(){const valid=period==='Month'?monthOK(periodMonth):/^\d{4}$/.test(periodYear)&&+periodYear>=1900;const prefix=period==='Month'?periodMonth:periodYear,start=prefix+(period==='Month'?'-01':'-01-01'),end=prefix+(period==='Month'?'-31':'-12-31');const rows=valid?db.records.filter(r=>r.date.startsWith(prefix)):[];return {valid,rows,start,end,open:balances(db.records.filter(r=>r.date<start)),close:balances(db.records.filter(r=>r.date<=end))};}
function dashboard(){const p=periodData(),rows=p.rows,b=balances(db.records),inc=sum(rows,r=>r.type==='Income'),spend=sum(rows,r=>r.type==='Spending'),saved=sum(rows,r=>r.type==='Saving'),otherIn=sum(rows,r=>r.type==='Other'&&dir(r)==='In'),otherOut=sum(rows,r=>r.type==='Other'&&dir(r)==='Out');
 const buckets=p.valid?(period==='Year'?Array.from({length:12},(_,i)=>({key:periodYear+'-'+String(i+1).padStart(2,'0'),label:new Date(2000,i,1).toLocaleString('en',{month:'short'})})):Array.from({length:new Date(+periodMonth.slice(0,4),+periodMonth.slice(5),0).getDate()},(_,i)=>({key:periodMonth+'-'+String(i+1).padStart(2,'0'),label:String(i+1)}))).map(x=>({...x,values:TYPES.slice(0,3).map(t=>sum(rows,r=>r.type===t&&r.date.startsWith(x.key)))})):[];
 const max=Math.max(1,...buckets.flatMap(x=>x.values)),cats=new Map();for(const r of rows.filter(r=>r.type==='Spending'))cats.set(r.category,(cats.get(r.category)||0)+r.cents);
 return '<section class="panel"><div class="row"><h2>Period dashboard</h2><div class="actions">'+select('period','View',['Month','Year'],period)+(period==='Month'?input('periodMonth','Month',periodMonth,'month'):input('periodYear','Calendar year',periodYear,'number','min="1900" max="9999"'))+'</div></div>'+(p.valid?stats([['Income',inc,'Selected period'],['Spending',spend,'Cash and saved-fund purchases'],['Saving contributions',saved,'Reserved, not an expense'],['Other received',otherIn,'Not counted as Income'],['Other paid',otherOut,'Includes lending / repayments'],['Closing available cash',p.close.cash,'As of period end'],['Closing saved funds',p.close.saved,'As of period end'],['Income less spending',inc-spend,'Not a cash balance']]):'<p>Select a valid period.</p>')+'<details><summary>How these balances connect</summary><p>Opening available cash '+money(p.open.cash)+' + Income '+money(inc)+' + Other receipts '+money(otherIn)+' − cash-funded Spending '+money(sum(rows,r=>r.type==='Spending'&&r.source==='Cash'))+' − Saving '+money(saved)+' − cash-funded Other payments '+money(sum(rows,r=>r.type==='Other'&&dir(r)==='Out'&&r.source==='Cash'))+' = closing cash '+money(p.close.cash)+'.</p><p>Opening saved funds '+money(p.open.saved)+' + Saving '+money(saved)+' − saved-fund usage '+money(sum(rows,r=>r.source!=='Cash'))+' = closing saved funds '+money(p.close.saved)+'. Borrowing is not earnings. Savings are not charged again as cash spending when used.</p></details></section><div class="two"><section class="panel"><h2>'+(period==='Year'?'Monthly':'Daily')+' activity</h2><div class="legend">'+[['Spending','#e86689'],['Saving','#78adff'],['Income','#59cba4']].map(([t,c])=>'<span><i style="background:'+c+'"></i>'+t+'</span>').join('')+'</div>'+(rows.length?'<div class="scroll" style="padding-bottom:28px"><div class="chart" role="img" aria-label="Spending, Saving and Income by date. Exact values in the following table.">'+buckets.map(x=>'<div class="bucket">'+x.values.map((n,i)=>'<i title="'+TYPES[i]+': '+money(n)+'" style="height:'+(n/max*100)+'%;background:'+['#e86689','#78adff','#59cba4'][i]+'"></i>').join('')+'<small>'+(period==='Year'||+x.label%5===1?x.label:'')+'</small></div>').join('')+'</div></div><details><summary>Exact chart values</summary><div class="scroll"><table><thead><tr><th>Date</th><th>Spending</th><th>Saving</th><th>Income</th></tr></thead><tbody>'+buckets.map(x=>'<tr><td>'+x.key+'</td>'+x.values.map(n=>'<td>'+money(n)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>':'<div class="empty">No activity in this period. Charts use recorded transactions only.</div>')+'</section><section class="panel"><h2>Spending by category</h2>'+(cats.size?[...cats].sort((a,b)=>b[1]-a[1]).map(([c,n])=>'<div class="barrow"><div class="row"><span>'+esc(c)+'</span><strong>'+money(n)+' · '+Math.round(n/spend*100)+'%</strong></div><div class="track"><i style="width:'+(n/spend*100)+'%"></i></div></div>').join(''):'<div class="empty">No Spending transactions in this period.</div>')+'</section></div><section class="panel"><h2>Current position · all recorded dates</h2>'+stats([['Available cash',b.cash,'Unreserved funds'],['Reserved saving',b.saved,'Includes general and goal saving'],['Lent, awaiting repayment',b.receivable,'Principal only'],['Borrowed, still owed',b.payable,'Principal only']])+'<p class="fine">These are recorded balances, not a bank feed or a complete net-worth statement.</p><div class="actions">'+button('newTx','Record a transaction','class="primary"')+button('navGoals','View goals')+'</div></section>';
}
function transactions(){const t=txDraft,b=balances(db.records),repay=t.type==='Other'&&['Lending repayment received','Borrowing repayment paid'].includes(t.mode),canSaved=t.type==='Spending'||t.type==='Other'&&t.mode==='Lending out';const loans=db.records.filter(r=>r.id!==editTx&&r.type==='Other'&&r.mode===(t.mode==='Lending repayment received'?'Lending out':'Borrowing received'));
 const rows=sorted(db.records).reverse().filter(r=>!txSearch||[r.category,r.note,r.type,r.date].join(' ').toLowerCase().includes(txSearch.toLowerCase()));
 return '<section class="panel" id="editor"><h2>'+(editTx?'Edit transaction':'Record a transaction')+'</h2><p class="fine">Record actual Income or Other → Opening balance first. Saving transfers cash into reserved funds. SIP may be a Saving category, not a separate type.</p><form id="txForm"><div class="grid">'+input('date','Date',t.date,'date','required max="'+today()+'"')+select('type','Type',TYPES,t.type)+(t.type==='Other'?select('mode','Other subtype',MODES,t.mode):'')+input('amount','Amount (INR)',t.amount,'number','required min="0.01" max="1000000000" step="0.01"')+'</div>'+(repay?select('loanId','Principal record being repaid',loans.map(r=>[r.id,r.date+' · '+r.category+' · original '+money(r.cents)+' · outstanding '+money(r.cents-(b.repaid[r.id]||0))]),t.loanId,'Select an earlier lending / borrowing record')+'<p class="fine">Principal only. Record interest separately as Income or Spending. Repayments enter or leave cash, even when the original lending used goal funds.</p>':'')+(canSaved?select('source','Pay from',[['Cash','Available cash'],['Goal','Saved goal funds'],['Saving','General saved funds']],t.source):'')+((t.type==='Saving'||canSaved&&t.source==='Goal')?select('goalId',t.type==='Saving'?'Link Saving to a goal':'Use saved money from goal',db.goals.map(g=>[g.id,g.name+' · reserved '+money(b.reserve[g.id]||0)]),t.goalId,t.type==='Saving'?'General saving (no goal)':'Select a goal'):'')+(t.type==='Spending'&&t.source==='Cash'?select('budgetCategory','Use a budget category (optional)',db.budgets.filter(x=>x.month===t.date.slice(0,7)).map(x=>[x.category,x.category]),'','Choose a category or type your own below'):'')+'<div class="grid">'+input('category','Category',t.category,'text','required maxlength="80"')+input('note','Note / counterparty',t.note,'text','maxlength="300"')+'</div><p class="fine">'+(t.type==='Income'||t.type==='Other'&&IN.includes(t.mode)?'Money enters available cash.':t.type==='Saving'?'Available cash decreases and reserved Saving increases. A linked goal updates automatically.':t.source!=='Cash'?'Only the selected reserved funds decrease. Available cash is not charged again.':'Available cash decreases. Cash-funded Spending updates the matching monthly category budget.')+'</p><div class="actions"><button class="primary">'+(editTx?'Save changes':'Record transaction')+'</button>'+(editTx?button('cancelTx','Cancel edit'):'')+'</div></form></section><section class="panel"><div class="row"><h2>Transaction history</h2><form id="searchForm" class="actions"><label>Search<input name="query" value="'+esc(txSearch)+'" placeholder="Category, note, type or date"></label><button>Search</button>'+button('clearSearch','Clear')+'</form></div>'+transactionTable(rows,true)+'</section>';
}
function transactionTable(rows,actions=false){return rows.length?'<div class="scroll"><table><thead><tr>'+['Date','Type','Category / note','Amount','Source / goal',...(actions?['Actions']:[])].map(t=>'<th>'+t+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr><td class="nowrap">'+r.date+'</td><td>'+r.type+(r.mode?'<div class="fine muted">'+esc(r.mode)+'</div>':'')+'</td><td>'+esc(r.category)+'<div class="fine muted">'+esc(r.note)+'</div></td><td class="nowrap">'+money(r.cents)+'</td><td>'+esc(r.source)+(r.goalId?'<div class="fine">'+esc(goalName(r.goalId))+'</div>':'')+'</td>'+(actions?'<td><div class="actions">'+button('editTx','Edit','class="small" data-id="'+esc(r.id)+'"')+button('deleteTx','Delete','class="small" data-id="'+esc(r.id)+'"')+'</div></td>':'')+'</tr>').join('')+'</tbody></table></div>':'<div class="empty">No matching records. Record funding first, then spending or saving.</div>';}
function goals(){const g=goalDraft,b=balances(db.records);return '<section class="panel" id="editor"><h2>'+(editGoal?'Edit goal':'Create a goal')+'</h2><form id="goalForm"><div class="grid">'+input('name','Goal name',g.name,'text','required maxlength="80"')+select('term','Time horizon',TERMS,g.term)+select('purpose','Purpose',PURPOSES,g.purpose)+input('created','Goal start date',g.created,'date','required max="'+today()+'"')+select('when','Achievement deadline',['Date','Years'],g.when)+(g.when==='Date'?input('targetDate','Achieve by',g.targetDate,'date','required'):input('years','Years from today',g.years,'number','required min="1" max="50" step="1"'))+input('category','Category',g.category,'text','required maxlength="80"')+input('amount','Target amount (INR)',g.amount,'number','required min="0.01" max="1000000000" step="0.01"')+'</div><p class="fine">Time horizons are your labels. The deadline drives the monthly contribution estimate. Start date permits historical contributions. Progress comes only from linked Saving transactions; no assumed returns.</p><div class="actions"><button class="primary">'+(editGoal?'Save goal changes':'Create goal')+'</button>'+(editGoal?button('cancelGoal','Cancel edit'):'')+'</div></form></section>'+(db.goals.length?'<div class="cards">'+db.goals.map(g=>{const c=b.contributed[g.id]||0,u=b.used[g.id]||0,r=b.reserve[g.id]||0,left=Math.max(0,g.target-c),months=Math.max(1,Math.ceil((Date.parse(g.targetDate)-Date.parse(today()))/(86400000*30.44)));return '<article class="card"><span class="tag">'+g.term+'</span><span class="tag">'+g.purpose+'</span><h2>'+esc(g.name)+'</h2><p class="fine">'+esc(g.category)+' · achieve by '+g.targetDate+'</p>'+progress(c,g.target)+'<p><strong>'+money(c)+'</strong> contributed of '+money(g.target)+' · '+Math.round(c/g.target*100)+'%</p><p class="fine">Still reserved: '+money(r)+'<br>Already used: '+money(u)+'<br>'+(left===0?'Contribution target reached.':g.targetDate<today()?'Deadline passed; '+money(left)+' still to contribute.':'Remaining '+money(left)+' · about '+money(Math.ceil(left/months))+' per month to deadline.')+'</p><p class="fine">Progress is cumulative contributions. Using funds reduces the reserved balance, not historical contributions.</p><div class="actions">'+button('contribute','Record contribution','class="primary" data-id="'+g.id+'"')+(r?button('useGoal',g.purpose==='Lending'?'Lend saved funds':'Use saved funds','data-id="'+g.id+'"'):'')+button('editGoal','Edit','class="small" data-id="'+g.id+'"')+button('deleteGoal','Delete','class="small" data-id="'+g.id+'"')+'</div></article>';}).join('')+'</div>':'<div class="empty">Create a goal, then record a linked Saving contribution from Transactions or the goal card.</div>');}
function budgets(){const info=monthOK(bm)?budgetInfo(db,bm):null;return '<section class="panel"><div class="row"><h2>Monthly funded budgets</h2>'+input('bm','Budget month',bm,'month')+'</div><p class="fine">Funding = opening available cash + actual Income / Other receipts − Saving − cash-funded Other payments. Borrowing is funding, not earnings. Budget limits are plans, not payments. Goal-funded purchases do not consume cash budgets.</p>'+(info?stats([['Opening cash',info.opening],['Month receipts',info.inflow],['Funding for budgets',info.funding],['Allocated limits',info.allocated],['Cash spending',info.actual],['Unbudgeted spending',info.unbudgeted]])+(info.allocated+info.unbudgeted>info.funding?'<p class="notice warning">Overallocated, including unbudgeted spending, by '+money(info.allocated+info.unbudgeted-info.funding)+' after transaction changes. Reduce limits or record actual funding.</p>':'')+'<form id="budgetForm"><h3>'+(editBudget?'Edit category limit':'Allocate a category limit')+'</h3><div class="grid">'+input('category','Category',budgetDraft.category,'text','required maxlength="80"')+input('amount','Monthly limit (INR)',budgetDraft.amount,'number','required min="0.01" max="1000000000" step="0.01"')+'</div><div class="actions"><button class="primary">'+(editBudget?'Save budget':'Allocate budget')+'</button>'+(editBudget?button('cancelBudget','Cancel edit'):'')+'</div></form>':'<p>Select a valid month.</p>')+'</section>'+(info&&info.plans.length?'<div class="cards">'+info.plans.map(p=>{const actual=sum(info.spending,r=>norm(r.category)===norm(p.category));return '<article class="card"><h2>'+esc(p.category)+'</h2>'+progress(actual,p.limit)+'<p>'+money(actual)+' used of '+money(p.limit)+'</p><p class="fine">'+(actual>p.limit?'Over budget by '+money(actual-p.limit):money(p.limit-actual)+' remaining')+'</p><div class="actions">'+button('budgetSpend','Record spending','data-id="'+p.id+'"')+button('editBudget','Edit','class="small" data-id="'+p.id+'"')+button('deleteBudget','Delete plan','class="small" data-id="'+p.id+'"')+'</div></article>';}).join('')+'</div>':'<div class="empty">Record funding first, then allocate monthly category limits. Matching Spending updates usage automatically.</div>');}
function filtered(){if(from&&!dateOK(from)||to&&!dateOK(to)||from&&to&&from>to)return [];return sorted(db.records.filter(r=>(!from||r.date>=from)&&(!to||r.date<=to)&&(kind==='All types'||r.type===kind)));}
function filterError(){return from&&!dateOK(from)||to&&!dateOK(to)?'Choose valid dates.':from&&to&&from>to?'From date must be on or before To date.':'';}
function exportsView(){const rows=filtered();return '<section class="panel"><h2>Excel report · exact dates</h2><p>Download the same transactions recorded in this application, with goal and budget links.</p><div class="actions" style="margin-bottom:18px">'+button('allDates','All dates')+button('thisMonth','This month')+button('thisYear','This year')+'</div><div class="grid">'+input('from','From date (included)',from,'date')+input('to','To date (included)',to,'date')+select('kind','Transaction type',['All types',...TYPES],kind)+'</div><p class="fine">For a day, use the same date twice. For a month/year, use its first and last dates. Blank endpoints mean earliest/latest available.</p>'+(filterError()?'<p role="alert">'+filterError()+'</p>':'')+stats(TYPES.map(t=>[t,sum(rows,r=>r.type===t)]))+'<p>'+rows.length+' matching transactions out of '+db.records.length+'.</p>'+button('excel','Download Excel (.xlsx)','class="primary" '+(filterError()?'disabled':''))+'<p class="fine">Sheets: Summary, All Records, Spending, Saving, Income, Other, Goals, Budgets. Transactions follow the exact dates and type filter. Goals show cumulative balances as of To date. Budgets show whole-month plans/actuals for intersecting months, not partial-month values. Dates are ISO text; amounts are numeric INR. No external packages.</p></section><section class="panel"><h2>Full JSON backup & restore</h2><p>Includes every transaction, goal, budget and link, regardless of Excel filters. This is a Personal edition v4 backup, not an installed-tablet database backup.</p>'+button('json','Download full JSON backup')+'<label style="margin-top:18px">Restore a Personal edition v4 backup<input type="file" id="restore" accept=".json,application/json"></label><p class="fine">Restore replaces this workspace only after review and confirmation. Older tablet/demo formats are rejected rather than guessed.</p></section><section class="panel"><h2>Encrypted Android storage</h2><p class="fine">Your signed-in account saves to an encrypted local file, not browser storage. JSON and Excel exports are unencrypted. For an encrypted account backup, use Account → Save encrypted account backup. Keep your password and recovery key safe.</p></section><section class="panel"><h2>Matching transactions</h2>'+transactionTable(rows)+'</section>';}
function help(){return '<section class="panel"><h2>Start here</h2><ol><li><p>Transactions → record Income (salary, earnings) or Other → Opening balance for money you already have. Use the actual date. Borrowing received belongs under Other, not Income.</p></li><li><p>Goals → choose short-, mid- or long-term; Savings, Purchasing or Lending; start date, achievement date/years, category and target.</p></li><li><p>Transactions → Saving → select the goal. The contribution moves cash to reserved funds and updates goal progress.</p></li><li><p>Budgets → select month → allocate cash-funded category limits. Record Spending using the same category. Over-budget spending is flagged, but real transactions are not hidden.</p></li><li><p>Use saved funds via the goal card, or choose Pay from → General saved funds. Cash is not charged twice. Repayments must reference the original lending/borrowing principal.</p></li><li><p>Overview → choose month/year. Export / Backup → From and To dates → Excel. Download full JSON regularly; restore JSON to move the ledger between browsers.</p></li></ol><h3>Important limits</h3><p>Offline Android application with separate encrypted local accounts. No online sync, bank feeds or investment valuation. Personal edition v4 JSON backups can be imported after signing in. Older tablet formats are not automatically migrated. JSON and Excel exports are unencrypted. This app starts empty.</p><p>Transactions cannot create negative cash or reserved balances at any date. Same-day entries use entry order. Editing or deleting funding is blocked when dependent transactions would become unfunded. Goal progress means cumulative contributions, not money currently available.</p><p>Interest is a separate Income or Spending entry; lending/borrowing repayments track principal only. Budget categories match case-insensitively. General saving can be spent directly; this edition does not provide a saving-to-cash withdrawal transaction.</p></section>';}
function render(){const names=['Overview','Transactions','Goals','Budgets','Export / Backup','Help'];$('#nav').innerHTML=names.map(t=>button('nav',esc(t),'data-tab="'+esc(t)+'" class="'+(tab===t?'active':'')+'"')).join('');$('#title').textContent=tab;$('#saveBadge').textContent=signedIn?'Encrypted account · '+accountName:'Signed out';$('#view').innerHTML=tab==='Overview'?dashboard():tab==='Transactions'?transactions():tab==='Goals'?goals():tab==='Budgets'?budgets():tab==='Export / Backup'?exportsView():help();decorate();}

function decorate(){
 const navIcons={'Overview':'overview','Transactions':'transactions','Goals':'goals','Budgets':'budgets','Export / Backup':'export','Help':'help'};
 document.querySelectorAll('#nav button').forEach(b=>{b.innerHTML=icon(navIcons[b.dataset.tab])+'<span>'+esc(b.dataset.tab)+'</span>';});
 document.querySelectorAll('#view [data-action]').forEach(b=>{const a=b.dataset.action;const k=a.startsWith('delete')?'delete':a.startsWith('edit')?'edit':['excel','json'].includes(a)?'export':['contribute','newTx'].includes(a)?'plus':a==='useGoal'?'wallet':a==='budgetSpend'?'spending':a==='navGoals'?'goals':null;if(k&&!b.querySelector('svg'))b.insertAdjacentHTML('afterbegin',icon(k));});
 document.querySelectorAll('#view button.primary:not([data-action])').forEach(b=>{if(!b.querySelector('svg'))b.insertAdjacentHTML('afterbegin',icon('check'));});
 document.querySelectorAll('.stat').forEach(card=>{const label=card.querySelector('span');if(!label||label.querySelector('svg'))return;const t=label.textContent.toLowerCase();const k=t.includes('income')||t.includes('receipt')?'income':t.includes('saving')||t.includes('saved')?'saving':t.includes('spending')?'spending':t.includes('borrow')||t.includes('lent')?'transactions':'wallet';label.insertAdjacentHTML('afterbegin',icon(k));});
 updateControls();
}
function updateControls(){
 const compact=document.body.classList.contains('compact');
 $('#layout').innerHTML=icon('monitor')+'<span>PC</span><span class="layout-switch '+(compact?'on':'')+'"><i></i></span>'+icon('phone')+'<span>Mobile</span>';
 $('#layout').setAttribute('role','switch');$('#layout').setAttribute('aria-checked',String(compact));$('#layout').setAttribute('aria-label','Mobile layout');
 const light=document.body.classList.contains('light');$('#theme').innerHTML=icon(light?'moon':'sun')+'<span>'+(light?'Dark':'Light')+'</span>';$('#theme').setAttribute('aria-label',light?'Switch to dark theme':'Switch to light theme');
}

function resetTx(){editTx='';txDraft={date:today(),type:'Income',mode:'Money received',source:'Cash',goalId:'',loanId:'',category:'',note:'',amount:''};}
function resetGoal(){editGoal='';goalDraft={name:'',term:'Short-term',purpose:'Savings',created:today(),when:'Date',years:'1',targetDate:'',category:'',amount:''};}
function scrollEditor(){document.getElementById('editor')?.scrollIntoView({behavior:'smooth',block:'start'});}
async function submitTx(){const t=formData('txForm'),n=cents(t.amount);if(!amountOK(n)||!dateOK(t.date)||t.date>today()||!t.category.trim())throw Error('Enter a valid actual date, category and positive amount with at most two decimals.');const old=db.records.find(r=>r.id===editTx),canSaved=t.type==='Spending'||t.type==='Other'&&t.mode==='Lending out',repay=t.type==='Other'&&['Lending repayment received','Borrowing repayment paid'].includes(t.mode),source=canSaved?t.source:'Cash';const r={id:old?.id||uid(),seq:old?.seq??Math.max(0,...db.records.map(r=>r.seq))+1,date:t.date,type:t.type,mode:t.type==='Other'?t.mode:'',source,goalId:t.type==='Saving'||source==='Goal'?t.goalId||'':'',loanId:repay?t.loanId||'':'',category:t.category.trim(),note:t.note||'',cents:n};if(source==='Goal'&&!r.goalId)throw Error('Choose a goal to use saved funds.');if(repay&&!r.loanId)throw Error('Choose the principal record being repaid.');const next={...db,records:old?db.records.map(x=>x.id===old.id?r:x):[...db.records,r]};txDraft={...txDraft,...t};if(await commit(next,'Transaction saved. Dashboard, goals, budgets and exports updated.')){resetTx();render();}}
async function submitGoal(){const g=formData('goalForm'),old=db.goals.find(x=>x.id===editGoal),n=cents(g.amount);let targetDate=g.targetDate;if(g.when==='Years'){const years=+g.years;if(!Number.isInteger(years)||years<1||years>50)throw Error('Choose 1–50 years.');const d=new Date(),m=d.getMonth();d.setFullYear(d.getFullYear()+years);if(d.getMonth()!==m)d.setDate(0);targetDate=fmtDate(d);}if(!amountOK(n)||!dateOK(g.created)||g.created>today()||!dateOK(targetDate)||targetDate<g.created||!g.name.trim()||!g.category.trim())throw Error('Complete goal name, start date, deadline, category and positive target.');const item={id:old?.id||uid(),name:g.name.trim(),term:g.term,purpose:g.purpose,created:g.created,targetDate,category:g.category.trim(),target:n};goalDraft={...goalDraft,...g};if(await commit({...db,goals:old?db.goals.map(x=>x.id===old.id?item:x):[...db.goals,item]},'Goal saved. Record linked Saving contributions to update progress.')){resetGoal();render();}}
async function submitBudget(){const t=formData('budgetForm'),n=cents(t.amount),category=t.category.trim();if(!monthOK(bm)||!amountOK(n)||!category)throw Error('Enter a valid month, category and positive limit.');const rest=db.budgets.filter(x=>x.id!==editBudget);if(rest.some(x=>x.month===bm&&norm(x.category)===norm(category)))throw Error('That category already has a budget this month. Edit it instead.');const info=budgetInfo(db,bm),allocated=rest.filter(x=>x.month===bm).reduce((s,x)=>s+x.limit,0);const unplanned=sum(info.spending,r=>norm(r.category)!==norm(category)&&!rest.some(b=>b.month===bm&&norm(b.category)===norm(r.category)));if(allocated+n+unplanned>info.funding)throw Error('Budget exceeds recorded funding. Available to allocate: '+money(Math.max(0,info.funding-allocated-unplanned))+'. Unbudgeted spending is already deducted. Record actual funding or lower the limit.');if(await commit({...db,budgets:[...rest,{id:editBudget||uid(),month:bm,category,limit:n}]},'Budget saved. Matching cash-funded Spending updates usage automatically.')){editBudget='';budgetDraft={category:'',amount:''};render();}}
async function download(blob,name){const bytes=new Uint8Array(await blob.arrayBuffer());const saved=await window.desktop.saveFile({name,bytes,ext:name.split('.').pop()});status(saved?'File saved.':'Save cancelled.');return saved;}
async function backup(){await download(new Blob([JSON.stringify(envelope(db,revision),null,2)],{type:'application/json'}),'Ryus_Ledger_Full_Backup_'+today()+'.json');}
// Native XLSX ZIP writer: numeric cells, literal strings, formulas with cached results.
function xlsx(sheets){const enc=new TextEncoder(),files=[],ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';const xmlEsc=v=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');const put=(name,s)=>files.push({name:enc.encode(name),data:enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+s)});
put('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>');
put('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+rel+'/officeDocument" Target="xl/workbook.xml"/></Relationships>');
put('xl/workbook.xml','<workbook xmlns="'+ns+'" xmlns:r="'+rel+'"><sheets>'+sheets.map((s,i)=>'<sheet name="'+xmlEsc(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets><calcPr fullCalcOnLoad="1"/></workbook>');
put('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+rel+'/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(sheets.length+1)+'" Type="'+rel+'/styles" Target="styles.xml"/></Relationships>');
put('xl/styles.xml','<styleSheet xmlns="'+ns+'"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;[Red](#,##0.00);&quot;-&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFB91546"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
const col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};sheets.forEach((s,i)=>{const data=s.rows.map((row,r)=>'<row r="'+(r+1)+'"'+(r===0?' ht="26" customHeight="1"':'')+'>'+row.map((v,c)=>{const ref=col(c)+(r+1),f=v&&typeof v==='object'&&'formula'in v,style=r===0?1:(f||typeof v==='number')&&(s.moneyCols||[]).includes(c)?2:0,a=' r="'+ref+'" s="'+style+'"';if(f)return '<c'+a+'><f>'+xmlEsc(v.formula)+'</f><v>'+v.result+'</v></c>';return typeof v==='number'?'<c'+a+'><v>'+v+'</v></c>':'<c'+a+' t="inlineStr"><is><t xml:space="preserve">'+xmlEsc(v)+'</t></is></c>';}).join('')+'</row>').join('');const widths=s.widths||Array.from({length:s.rows[0].length},(_,i)=>i===9?45:24);put('xl/worksheets/sheet'+(i+1)+'.xml','<worksheet xmlns="'+ns+'"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+widths.map((w,c)=>'<col min="'+(c+1)+'" max="'+(c+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols><sheetData>'+data+'</sheetData>'+(s.filter?'<autoFilter ref="A1:'+col(s.rows[0].length-1)+s.rows.length+'"/>':'')+'</worksheet>');});
const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});const crc=a=>{let c=0xffffffff;for(const b of a)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;};let offset=0;const chunks=[],central=[];files.forEach(f=>{const size=f.data.length,sum=crc(f.data),a=new Uint8Array(30+f.name.length),d=new DataView(a.buffer);d.setUint32(0,0x04034b50,true);d.setUint16(4,20,true);d.setUint16(6,0x800,true);d.setUint16(12,33,true);d.setUint32(14,sum,true);d.setUint32(18,size,true);d.setUint32(22,size,true);d.setUint16(26,f.name.length,true);a.set(f.name,30);chunks.push(a,f.data);const b=new Uint8Array(46+f.name.length),v=new DataView(b.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,33,true);v.setUint32(16,sum,true);v.setUint32(20,size,true);v.setUint32(24,size,true);v.setUint16(28,f.name.length,true);v.setUint32(42,offset,true);b.set(f.name,46);central.push(b);offset+=a.length+size;});const e=new Uint8Array(22),v=new DataView(e.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,central.reduce((n,a)=>n+a.length,0),true);v.setUint32(16,offset,true);return new Blob([...chunks,...central,e],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});}
async function excel(){if(filterError())throw Error(filterError());const rows=filtered(),head=['Date (YYYY-MM-DD)','Type','Category','Amount (INR)','Other subtype','Direction','Funding source','Goal','Linked principal ID','Note','Transaction ID'];const detail=(name,list)=>({name,filter:true,moneyCols:[3],rows:[head,...list.map(r=>[r.date,r.type,r.category,r.cents/100,r.mode,dir(r),r.source,r.goalId?goalName(r.goalId):'',r.loanId,r.note,r.id])]});const summary=[['Ryu’s Ledger','Android release 5.2.0'],['From',from||'All available dates'],['To',to||'All available dates'],['Type',kind],['Matching transactions',rows.length],['Currency','INR'],['Date rule','Both endpoints included'],['Accounting','Saving is a transfer, not an expense. Other receipts are not Income. Saved-fund purchases do not charge cash twice.'],[],['Type','Recorded amount (INR)']];const sheets=[{name:'Summary',rows:summary,moneyCols:[1],widths:[32,95]},detail('All Records',rows)];TYPES.forEach(t=>{const list=rows.filter(r=>r.type===t);sheets.push(detail(t,list));summary.push([t,{formula:list.length?'SUM('+t+'!D2:D'+(list.length+1)+')':'0',result:sum(list,()=>true)/100}]);});summary.push(['Other inflows',sum(rows,r=>r.type==='Other'&&dir(r)==='In')/100],['Other outflows',sum(rows,r=>r.type==='Other'&&dir(r)==='Out')/100]);if(!rows.length)summary.push(['Empty result','No matching transactions. Detail sheets contain headers only.']);const asOf=to||today(),b=balances(db.records.filter(r=>r.date<=asOf));sheets.push({name:'Goals',filter:true,moneyCols:[4,6,7,8],rows:[['Goal','Term','Purpose','Category','Target (INR)','Achievement date','Contributed as of To (INR)','Used as of To (INR)','Reserved as of To (INR)','Goal ID'],...db.goals.filter(g=>g.created<=asOf).map(g=>[g.name,g.term,g.purpose,g.category,g.target/100,g.targetDate,(b.contributed[g.id]||0)/100,(b.used[g.id]||0)/100,(b.reserve[g.id]||0)/100,g.id])]});sheets.push({name:'Budgets',filter:true,moneyCols:[2,3,4,5],rows:[['Month','Category','Limit (INR)','Whole-month actual (INR)','Remaining (INR)','Whole-month funding (INR)'],...db.budgets.filter(x=>(!from||x.month>=from.slice(0,7))&&(!to||x.month<=to.slice(0,7))).map(x=>{const i=budgetInfo(db,x.month),a=sum(i.spending,r=>norm(r.category)===norm(x.category));return [x.month,x.category,x.limit/100,a/100,(x.limit-a)/100,i.funding/100];})]});summary.push(['Goals scope','Cumulative through To date, regardless of From/type filter.'],['Budgets scope','Whole-month plans and actuals for months intersecting the range, regardless of type filter.'],['Source','Your locally recorded Android account data. Not connected to a bank or tablet server.']);await download(xlsx(sheets),'Ryus_Ledger_'+(from||'all')+'_to_'+(to||'latest')+'.xlsx');}
$('#view').addEventListener('submit',async e=>{e.preventDefault();try{if(e.target.id==='txForm')await submitTx();if(e.target.id==='goalForm')await submitGoal();if(e.target.id==='budgetForm')await submitBudget();if(e.target.id==='searchForm'){txSearch=formData('searchForm').query;render();}}catch(err){status(err.message);}});
$('#view').addEventListener('change',async e=>{const el=e.target,k=el.id;try{
 if(['type','mode','source','goalId','budgetCategory'].includes(k)&&el.closest('#txForm')){txDraft={...txDraft,...formData('txForm')};if(k==='type'){txDraft.mode='Money received';txDraft.source='Cash';txDraft.goalId='';txDraft.loanId='';}if(k==='mode'){txDraft.source='Cash';txDraft.goalId='';txDraft.loanId='';}if(k==='source')txDraft.goalId='';if(k==='goalId'){const g=db.goals.find(x=>x.id===el.value);if(g)txDraft.category=g.category;}if(k==='budgetCategory')txDraft.category=el.value;render();}
 if(k==='when'){goalDraft={...goalDraft,...formData('goalForm')};render();}
 if(k==='period'){period=el.value;render();}if(k==='periodMonth'){periodMonth=el.value;render();}if(k==='periodYear'){periodYear=el.value;render();}if(k==='bm'){bm=el.value;editBudget='';budgetDraft={category:'',amount:''};render();}
 if(['from','to','kind'].includes(k)){if(k==='from')from=el.value;if(k==='to')to=el.value;if(k==='kind')kind=el.value;render();}
 if(k==='restore'){const f=el.files?.[0];el.value='';if(!f)return;if(f.size>10000000)throw Error('Maximum backup size is 10 MB.');const x=JSON.parse(await f.text());if(x.schema!==SCHEMA||x.version!==4||x.amountUnit!=='paise'||x.currency!=='INR')throw Error('Not a Personal edition v4 backup. Older formats cannot be safely guessed.');pending=clean(validate(x.data));confirmAction('Replace this workspace?',pending.records.length+' transactions, '+pending.goals.length+' goals, '+pending.budgets.length+' budgets. Download the current JSON backup first if needed. This replaces the current data.',async()=>{const next=pending;pending=null;if(blocked){saving=false;blocked=false;}if(await commit(next,'Backup restored. All connected screens updated.')){resetTx();resetGoal();editBudget='';render();}});}
 }catch(err){status(err.message);render();}});
document.addEventListener('click',async e=>{const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action,key=el.dataset.id;try{
 if(a==='nav')nav(el.dataset.tab);if(a==='navGoals')nav('Goals');if(a==='newTx'){resetTx();nav('Transactions');}
 if(a==='cancelTx'){resetTx();render();}if(a==='cancelGoal'){resetGoal();render();}if(a==='cancelBudget'){editBudget='';budgetDraft={category:'',amount:''};render();}
 if(a==='clearSearch'){txSearch='';render();}
 if(a==='editTx'){const r=db.records.find(x=>x.id===key);editTx=r.id;txDraft={...r,amount:(r.cents/100).toFixed(2)};render();scrollEditor();}
 if(a==='deleteTx')confirmAction('Delete transaction?','Dependent transactions will be checked. Deletion is blocked if later cash or saved balances would become negative.',()=>commit({...db,records:db.records.filter(r=>r.id!==key)},'Transaction deleted. Connected balances updated.'));
 if(a==='editGoal'){const g=db.goals.find(x=>x.id===key);editGoal=g.id;goalDraft={...g,when:'Date',years:'1',amount:(g.target/100).toFixed(2)};render();scrollEditor();}
 if(a==='deleteGoal'){if(db.records.some(r=>r.goalId===key))throw Error('This goal has linked transactions. Keep it for history or remove its linked transactions first.');confirmAction('Delete goal?','This removes the goal plan. No linked transactions exist.',()=>commit({...db,goals:db.goals.filter(g=>g.id!==key)},'Goal deleted.'));}
 if(a==='contribute'||a==='useGoal'){const g=db.goals.find(x=>x.id===key),use=a==='useGoal';editTx='';txDraft={date:today(),type:use?(g.purpose==='Lending'?'Other':'Spending'):'Saving',mode:use&&g.purpose==='Lending'?'Lending out':'Money received',source:use?'Goal':'Cash',goalId:g.id,loanId:'',category:g.category,note:g.name,amount:''};nav('Transactions');}
 if(a==='editBudget'){const b=db.budgets.find(x=>x.id===key);editBudget=b.id;budgetDraft={category:b.category,amount:(b.limit/100).toFixed(2)};render();}
 if(a==='deleteBudget')confirmAction('Delete budget plan?','Actual Spending transactions remain unchanged.',()=>commit({...db,budgets:db.budgets.filter(b=>b.id!==key)},'Budget plan deleted. Transactions kept.'));
 if(a==='budgetSpend'){const b=db.budgets.find(x=>x.id===key);resetTx();txDraft={...txDraft,date:bm===nowMonth()?today():bm+'-01',type:'Spending',category:b.category};nav('Transactions');}
 if(a==='allDates'){from='';to='';kind='All types';render();}if(a==='thisMonth'){from=nowMonth()+'-01';const d=new Date();to=fmtDate(new Date(d.getFullYear(),d.getMonth()+1,0));render();}if(a==='thisYear'){from=today().slice(0,4)+'-01-01';to=today().slice(0,4)+'-12-31';render();}
 if(a==='json')await backup();if(a==='excel')await excel();
 }catch(err){status(err.message);}});
$('#theme').onclick=()=>{document.body.classList.toggle('light');updateControls();};
$('#layout').onclick=()=>{document.body.classList.toggle('compact');updateControls();};

render();
$('#pictureIcon').insertAdjacentHTML('afterbegin',icon('wallet'));
$('#localIcon').insertAdjacentHTML('afterbegin',icon('shield'));
$('#screenIcon').insertAdjacentHTML('afterbegin',icon('monitor'));
document.querySelector('header .brand').insertAdjacentHTML('beforebegin','<span class="brand-icon">'+icon('wallet')+'</span>');
let authMode='login',authBusy=false,recoveryKeyShown='',pendingLogin=null;
const authInput=(name,label,type='text',extra='')=>'<label>'+label+'<input name="'+name+'" type="'+type+'" required '+extra+'></label>';
function authView(mode='login',message=''){
 authMode=mode;const card=$('#authCard');
 if(mode==='recoveryKey'){
 card.innerHTML='<div class="welcome-card-icon">'+icon('shield')+'</div><h2>Save your recovery key</h2><p>This key can reset your password and unlock your encrypted records. Keep it offline or in a password manager. No email is sent.</p><div class="notice warning"><code id="recoveryText" style="overflow-wrap:anywhere;user-select:all">'+esc(recoveryKeyShown)+'</code></div><button id="saveRecovery">Save recovery key file</button><label class="check"><input type="checkbox" id="keySaved">I have saved the full recovery key securely</label><button class="primary" id="finishRecovery" disabled>Continue</button><p class="fine">A password reset rotates the key. Older encrypted backups still require their older password or recovery key.</p><div id="authMessage" role="status"></div>';
 $('#keySaved').onchange=()=>$('#finishRecovery').disabled=!$('#keySaved').checked;
 $('#saveRecovery').onclick=async()=>{try{await download(new Blob(['Ryu’s Ledger recovery key\nLogin label: '+accountEmail+'\n\n'+recoveryKeyShown+'\n\nKeep private. This key unlocks the encrypted account.\n'],{type:'text/plain'}),'Ryus_Ledger_Recovery_Key.txt');}catch(e){$('#authMessage').textContent=e.message;}};
 $('#finishRecovery').onclick=()=>{recoveryKeyShown='';if(pendingLogin){const r=pendingLogin;pendingLogin=null;enter(r);}else authView('login','Password reset complete. Sign in with your new password.');};return;
 }
 const register=mode==='register',recover=mode==='recover';
 card.innerHTML='<div class="welcome-card-icon">'+icon('wallet')+'</div><h2>'+(register?'Create your account':recover?'Reset your password':'Welcome back')+'</h2><p>'+(register?'Your own encrypted ledger on this Android device.':recover?'Use the recovery key saved during account setup.':'A little clarity starts here.')+'</p><div class="welcome-wordmark">Ryu’s Ledger<span>.</span></div><form id="authForm">'+(register?authInput('name','Your name','text','maxlength="80" autocomplete="name"'):'')+authInput('email','Email / local login label','email','maxlength="254" autocomplete="username"')+(recover?authInput('recoveryKey','Recovery key','password','maxlength="100" autocomplete="off"'):'')+authInput(recover?'newPassword':'password',recover?'New password':'Password','password','maxlength="256" '+(register||recover?'minlength="14" autocomplete="new-password"':'autocomplete="current-password"'))+(register||recover?authInput('confirmPassword','Confirm password','password','minlength="14" maxlength="256" autocomplete="new-password"'):'')+'<label class="check"><input id="showAuth" type="checkbox">Show passwords / recovery key</label><button class="primary">'+(register?'Create account':recover?'Reset password':'Sign in')+'</button></form><div id="authMessage" class="fine" role="status" style="margin:12px 0;overflow-wrap:anywhere">'+esc(message)+'</div><div class="actions"><button id="authLogin">Sign in</button><button id="authRegister">Create account</button><button id="authRecover">Forgot password?</button></div><button id="importEncrypted" style="margin-top:14px">Import encrypted account backup</button><div class="notice"><strong>Offline Android account</strong><br>Your email is a login label, not verified. No email, OTP or cloud service. Use a 14+ character passphrase. Without your password or recovery key, encrypted records cannot be recovered.</div>';
 $('#authLogin').onclick=()=>authView('login');$('#authRegister').onclick=()=>authView('register');$('#authRecover').onclick=()=>authView('recover');
 $('#showAuth').onchange=e=>card.querySelectorAll('input[name=password],input[name=newPassword],input[name=confirmPassword],input[name=recoveryKey]').forEach(i=>i.type=e.target.checked?'text':'password');
 $('#importEncrypted').onclick=async()=>{try{const r=await window.desktop.importAccount();if(r)authView('login','Account imported. Sign in using its original password or recovery key.');}catch(e){$('#authMessage').textContent=e.message;}};
 $('#authForm').onsubmit=async e=>{e.preventDefault();if(authBusy)return;const a=Object.fromEntries(new FormData(e.target).entries());try{if((register||recover)&&a.confirmPassword!==(recover?a.newPassword:a.password))throw Error('Passwords do not match.');authBusy=true;card.querySelectorAll('button').forEach(b=>b.disabled=true);$('#authMessage').textContent='Working…';if(!window.desktop)throw Error('Open the installed Android application, not this HTML file.');const r=await window.desktop[register?'register':recover?'recover':'login'](a);accountEmail=a.email;if(register){pendingLogin=r;recoveryKeyShown=r.recoveryKey;authView('recoveryKey');}else if(recover){pendingLogin=null;recoveryKeyShown=r.recoveryKey;authView('recoveryKey');}else enter(r);}catch(err){$('#authMessage').textContent=err.message;card.querySelectorAll('button').forEach(b=>b.disabled=false);}finally{authBusy=false;}};
}
function enter(r){db=clean(validate(r.data));revision=r.revision;accountName=r.name;accountEmail=r.email;signedIn=true;$('#authCard').replaceChildren();tab='Overview';$('#welcome').hidden=true;$('#workspace').hidden=false;$('#accountBtn').hidden=false;$('#lockBtn').hidden=false;status('Signed in. Your records are saved to your encrypted account.');render();window.scrollTo(0,0);}
$('#lockBtn').onclick=async()=>{try{if(writeBusy)throw Error('Wait for the current save to finish.');await window.desktop.lock();location.reload();}catch(e){status(e.message);}};
function accountView(){
 $('#view').innerHTML='<section class="panel"><h2>Account & security</h2><p>'+esc(accountName)+' · '+esc(accountEmail)+'</p><p class="fine">Local encrypted account. Locks after 15 minutes without activity, on app backgrounding, or when closed. No email verification or online sync.</p><form id="changeForm"><h3>Change password</h3>'+authInput('currentPassword','Current password','password','maxlength="256" autocomplete="current-password"')+authInput('newPassword','New password','password','minlength="14" maxlength="256" autocomplete="new-password"')+authInput('confirmPassword','Confirm new password','password','minlength="14" maxlength="256" autocomplete="new-password"')+'<button class="primary">Change password</button></form><hr><form id="rotateForm"><h3>Replace recovery key</h3><p class="fine">Your current key will stop working for the current account. Old backups retain their old keys.</p>'+authInput('currentPassword','Current password','password','maxlength="256" autocomplete="current-password"')+'<button>Generate replacement key</button></form><hr><h3>Encrypted account backup</h3><p class="fine">Includes your encrypted ledger and account access wrappers. Keep a separate copy off this Android device. Requires its password or recovery key to restore.</p><button id="encryptedBackup">Save encrypted account backup</button></section>';
 $('#changeForm').onsubmit=async e=>{e.preventDefault();const a=Object.fromEntries(new FormData(e.target));try{if(a.newPassword!==a.confirmPassword)throw Error('Passwords do not match.');await window.desktop.change(a);e.target.reset();status('Password changed. Keep your existing recovery key.');}catch(err){status(err.message);}};
 $('#rotateForm').onsubmit=async e=>{e.preventDefault();try{const a=Object.fromEntries(new FormData(e.target));const r=await window.desktop.rotate(a);e.target.reset();recoveryKeyShown=r.recoveryKey;pendingLogin={data:db,revision,name:accountName,email:accountEmail};$('#workspace').hidden=true;$('#welcome').hidden=false;authView('recoveryKey');}catch(err){status(err.message);}};
 $('#encryptedBackup').onclick=async()=>{try{const ok=await window.desktop.encryptedBackup();status(ok?'Encrypted account backup saved.':'Backup cancelled.');}catch(e){status(e.message);}};
}
$('#accountBtn').onclick=()=>{tab='Account';$('#title').textContent='Account';status('');accountView();};
let touched=0;for(const ev of ['pointerdown','keydown','wheel'])document.addEventListener(ev,()=>{if(Date.now()-touched>15000){touched=Date.now();window.desktop?.touch();}},{passive:true});
authView();


/*
 * RYU'S LEDGER 5.2.0
 * Android Quick Unlock account-security patch.
 *
 * This overrides only accountView(), enter(), and the top Lock button.
 * Existing transactions, goals, budgets, reports, validation,
 * backups, and Excel exports remain unchanged.
 */

accountView = async function () {
    $('#view').innerHTML =
        '<section class="panel">'
        + '<h2>Account &amp; security</h2>'
        + '<p>'
        + esc(accountName)
        + ' · '
        + esc(accountEmail)
        + '</p>'

        + '<p class="fine">'
        + 'This is a local encrypted account. Your Ledger password '
        + 'and recovery key remain the primary account credentials.'
        + '</p>'

        + '<div id="quickSecurity">'
        + '<div class="notice">Checking phone security…</div>'
        + '</div>'

        + '<hr>'

        + '<form id="changeForm">'
        + '<h3>Change Ledger password</h3>'

        + authInput(
            'currentPassword',
            'Current password',
            'password',
            'maxlength="256" autocomplete="current-password"'
        )

        + authInput(
            'newPassword',
            'New password',
            'password',
            'minlength="14" maxlength="256" autocomplete="new-password"'
        )

        + authInput(
            'confirmPassword',
            'Confirm new password',
            'password',
            'minlength="14" maxlength="256" autocomplete="new-password"'
        )

        + '<button class="primary">'
        + icon('shield')
        + 'Change password'
        + '</button>'
        + '</form>'

        + '<hr>'

        + '<form id="rotateForm">'
        + '<h3>Replace recovery key</h3>'

        + '<p class="fine">'
        + 'Your current recovery key will stop working for the current '
        + 'account. Older encrypted backups retain their older password '
        + 'or recovery key.'
        + '</p>'

        + authInput(
            'currentPassword',
            'Current password',
            'password',
            'maxlength="256" autocomplete="current-password"'
        )

        + '<button>'
        + icon('shield')
        + 'Generate replacement key'
        + '</button>'
        + '</form>'

        + '<hr>'

        + '<h3>Encrypted account backup</h3>'

        + '<p class="fine">'
        + 'Includes your encrypted ledger and account-access wrappers. '
        + 'Keep an independent copy outside this phone.'
        + '</p>'

        + '<button id="encryptedBackup">'
        + icon('export')
        + 'Save encrypted account backup'
        + '</button>'

        + '</section>';

    /*
     * Password change
     */
    $('#changeForm').onsubmit = async event => {
        event.preventDefault();

        const values = Object.fromEntries(
            new FormData(event.target)
        );

        try {
            if (values.newPassword !== values.confirmPassword) {
                throw new Error('Passwords do not match.');
            }

            await window.desktop.change(values);

            event.target.reset();

            status(
                'Password changed. Your existing recovery key remains valid.'
            );

        } catch (error) {
            status(error.message);
        }
    };

    /*
     * Recovery-key replacement
     */
    $('#rotateForm').onsubmit = async event => {
        event.preventDefault();

        try {
            const values = Object.fromEntries(
                new FormData(event.target)
            );

            const result =
                await window.desktop.rotate(values);

            event.target.reset();

            recoveryKeyShown = result.recoveryKey;

            pendingLogin = {
                data: db,
                revision,
                name: accountName,
                email: accountEmail
            };

            $('#workspace').hidden = true;
            $('#welcome').hidden = false;

            authView('recoveryKey');

        } catch (error) {
            status(error.message);
        }
    };

    /*
     * Encrypted-account backup
     */
    $('#encryptedBackup').onclick = async () => {
        try {
            const saved =
                await window.desktop.encryptedBackup();

            status(
                saved
                    ? 'Encrypted account backup saved.'
                    : 'Backup cancelled.'
            );

        } catch (error) {
            status(error.message);
        }
    };

    /*
     * Android Quick Unlock settings
     */
    const securityPanel = $('#quickSecurity');

    try {
        if (
            !window.desktop
            || typeof window.desktop.quickStatus !== 'function'
        ) {
            securityPanel.innerHTML =
                '<div class="notice warning">'
                + '<strong>Quick Unlock unavailable</strong><br>'
                + 'Quick Unlock requires the Android 5.2.0 native application.'
                + '</div>';

            return;
        }

        let quick =
            await window.desktop.quickStatus();

        const drawQuickSecurity = () => {
            const enabled =
                Boolean(quick && quick.enabled);

            const available =
                Boolean(quick && quick.available);

            let quickMessage;

            if (enabled) {
                quickMessage =
                    'Quick Unlock is registered for '
                    + esc(quick.email || accountEmail)
                    + '.';
            } else {
                quickMessage =
                    'Use fingerprint, supported face authentication, '
                    + 'phone PIN, pattern, or password to reopen this account.';
            }

            let statusTitle;
            let statusDescription;

            if (enabled) {
                statusTitle = 'Quick Unlock enabled';

                statusDescription =
                    'Your Ledger password is not stored. Android Keystore '
                    + 'protects a wrapped copy of the Ledger master key.';

            } else if (available) {
                statusTitle = 'Quick Unlock is ready';

                               statusDescription =
                                   'Android will ask for fingerprint, supported face '
                                   + 'authentication, PIN, pattern, or phone password.';

                           } else {
                               statusTitle =
                                   'Phone authentication is unavailable';

                               statusDescription =
                                   'Configure a secure phone PIN, pattern, password, '
                                   + 'fingerprint, or supported face authentication first.';
                           }

                           securityPanel.innerHTML =
                               '<h3>'
                               + icon('shield')
                               + ' Quick Unlock'
                               + '</h3>'
                               + '<p class="fine">'
                               + quickMessage
                               + '</p>'
                               + '<div class="notice '
                               + (!available && !enabled ? 'warning' : '')
                               + '">'
                               + '<strong>'
                               + statusTitle
                               + '</strong><br>'
                               + statusDescription
                               + '</div>'
                               + '<div class="actions">'
                               + (
                                   !enabled && available
                                       ? '<button id="enableQuick" class="primary">'
                                           + icon('shield')
                                           + 'Enable Quick Unlock'
                                           + '</button>'
                                       : ''
                               )
                               + (
                                   enabled
                                       ? '<button id="lockQuick">'
                                           + icon('shield')
                                           + 'Lock application'
                                           + '</button>'
                                           + '<button id="signOutQuick">'
                                           + icon('arrow')
                                           + 'Sign out · keep Quick Unlock'
                                           + '</button>'
                                           + '<button id="forgetQuick" class="danger">'
                                           + icon('delete')
                                           + 'Sign out &amp; forget this device'
                                           + '</button>'
                                       : ''
                               )
                               + '</div>'
                               + '<p class="fine">'
                               + 'The Ledger password and recovery key remain available '
                               + 'if Android Quick Unlock cannot be used.'
                               + '</p>';

                           const enableButton = $('#enableQuick');

                           if (enableButton) {
                               enableButton.onclick = async () => {
                                   try {
                                       enableButton.disabled = true;
                                       enableButton.textContent =
                                           'Waiting for phone authentication…';

                                       quick =
                                           await window.desktop.quickEnable();

                                       status(
                                           'Quick Unlock enabled on this device.'
                                       );

                                       drawQuickSecurity();

                                   } catch (error) {
                                       status(
                                           'Quick Unlock was not enabled: '
                                           + error.message
                                       );

                                       enableButton.disabled = false;
                                       enableButton.innerHTML =
                                           icon('shield')
                                           + 'Enable Quick Unlock';
                                   }
                               };
                           }

                           const lockButton = $('#lockQuick');

                           if (lockButton) {
                               lockButton.onclick = async () => {
                                   try {
                                       if (writeBusy) {
                                           throw new Error(
                                               'Wait for the current save to finish.'
                                           );
                                       }

                                       await window.desktop.lockKeepQuick();
                                       location.reload();

                                   } catch (error) {
                                       status(error.message);
                                   }
                               };
                           }

                           const signOutButton = $('#signOutQuick');

                           if (signOutButton) {
                               signOutButton.onclick = async () => {
                                   try {
                                       if (writeBusy) {
                                           throw new Error(
                                               'Wait for the current save to finish.'
                                           );
                                       }

                                       await window.desktop.lockKeepQuick();
                                       location.reload();

                                   } catch (error) {
                                       status(error.message);
                                   }
                               };
                           }

                           const forgetButton = $('#forgetQuick');

                           if (forgetButton) {
                               forgetButton.onclick = () => {
                                   confirmAction(
                                       'Forget Quick Unlock on this device?',
                                       'The encrypted account and financial records '
                                           + 'will remain on this phone. The next sign-in '
                                           + 'will require the Ledger password or recovery process.',
                                       async () => {
                                           try {
                                               if (writeBusy) {
                                                   throw new Error(
                                                       'Wait for the current save to finish.'
                                                   );
                                               }

                                               await window.desktop.forgetDevice();
                                               location.reload();

                                           } catch (error) {
                                               status(error.message);
                                           }
                                       }
                                   );
                               };
                           }
                       };

                       drawQuickSecurity();

                   } catch (error) {
                       securityPanel.innerHTML =
                           '<div class="notice warning">'
                           + '<strong>Quick Unlock status unavailable</strong><br>'
                           + esc(error.message)
                           + '</div>';
                   }
               };


               /*
                * Replace the original post-login function.
                */
               enter = function (result) {
                   db = clean(validate(result.data));

                   revision = result.revision;
                   accountName = result.name;
                   accountEmail = result.email;
                   signedIn = true;

                   $('#authCard').replaceChildren();

                   tab = 'Overview';

                   $('#welcome').hidden = true;
                   $('#workspace').hidden = false;
                   $('#accountBtn').hidden = false;
                   $('#lockBtn').hidden = false;

                   $('#lockBtn').textContent = 'Lock';

                   status(
                       'Signed in. Your records are saved to your encrypted account.'
                   );

                   render();
                   window.scrollTo(0, 0);

                   if (
                       window.desktop
                       && typeof window.desktop.quickStatus === 'function'
                   ) {
                       window.desktop.quickStatus()
                           .then(quick => {
                               if (
                                   signedIn
                                   && quick
                                   && quick.available
                                   && !quick.enabled
                               ) {
                                   status(
                                       'Signed in. Open Account to enable fingerprint '
                                       + 'or phone-lock Quick Unlock.'
                                   );
                               }
                           })
                           .catch(() => {
                               /*
                                * Normal password sign-in continues to work if the
                                * Android security status cannot be retrieved.
                                */
                           });
                   }
               };


               /*
                * Top Lock button: preserve Quick Unlock registration.
                */
               $('#lockBtn').textContent = 'Lock';

               $('#lockBtn').onclick = async () => {
                   try {
                       if (writeBusy) {
                           throw new Error(
                               'Wait for the current save to finish.'
                           );
                       }

                       await window.desktop.lockKeepQuick();
                       location.reload();

                   } catch (error) {
                       status(error.message);
                   }
               };