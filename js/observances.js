// Dates a social media manager plans around: holidays, shopping days, season starts and clock changes,
// awareness months, and fun "national days" (US). The calendar, the planning reminders, and the
// "What to post next" notes all use this list; the server loads this same file.
// Each date: { date: 'YYYY-MM-DD', name, kind, major, tip, end?, approx?, lead? }. Major dates are the
// ones reminders cover by default; `lead` fixes how far ahead to remind (clock changes: a week).
const OBSERVANCE_KINDS={holiday:'Holiday',shopping:'Shopping',season:'Season',month:'Awareness month',culture:'Cultural & religious',fun:'Fun day'};
// Lunar and Hebrew calendar dates, which don't follow a simple rule. Extend as new years come up.
const LUNAR_DATES={
  lunarNewYear:{2025:'01-29',2026:'02-17',2027:'02-06',2028:'01-26',2029:'02-13',2030:'02-03'},
  ramadan:{2025:'03-01',2026:'02-18',2027:'02-08',2028:'01-28',2029:'01-16',2030:'01-06'},
  eid:{2025:'03-30',2026:'03-20',2027:'03-10',2028:'02-27',2029:'02-14',2030:'02-05'},
  passover:{2025:'04-12',2026:'04-01',2027:'04-21',2028:'04-10',2029:'03-30',2030:'04-17'},
  diwali:{2025:'10-20',2026:'11-08',2027:'10-29',2028:'10-17',2029:'11-05',2030:'10-26'},
  hanukkah:{2025:'12-14',2026:'12-04',2027:'12-24',2028:'12-12',2029:'12-01',2030:'12-20'}
};
const observanceCache=new Map();
// Dates are worked out in UTC so the browser and the server always agree on the day.
function utcDay(year,month,day){return new Date(Date.UTC(year,month,day));}
function isoDay(date){return date.toISOString().slice(0,10);}
function nthWeekday(year,month,weekday,n){const first=utcDay(year,month,1),offset=(weekday-first.getUTCDay()+7)%7;return utcDay(year,month,1+offset+(n-1)*7);}
function lastWeekday(year,month,weekday){const last=utcDay(year,month+1,0);return utcDay(year,month,last.getUTCDate()-((last.getUTCDay()-weekday+7)%7));}
function easterDate(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;return utcDay(year,month-1,day);}
function shiftDays(date,days){return new Date(date.getTime()+days*86400000);}
// Equinoxes and solstices (Meeus's mean formulas, good to within an hour or two), as the date in US Eastern time.
function seasonStart(year,index){const y=(year-2000)/1000,terms=[[2451623.80984,365242.37404,0.05169,-0.00411,-0.00057],[2451716.56767,365241.62603,0.00325,0.00888,-0.00030],[2451810.21715,365242.01767,-0.11575,0.00337,0.00078],[2451900.05952,365242.74049,-0.06223,-0.00823,0.00032]][index],jde=terms[0]+terms[1]*y+terms[2]*y*y+terms[3]*y**3+terms[4]*y**4,eastern=(jde-2440587.5)*86400000-(index===3?5:4)*3600000,at=new Date(eastern);return utcDay(at.getUTCFullYear(),at.getUTCMonth(),at.getUTCDate());}

function observancesFor(year){
  if(observanceCache.has(year))return observanceCache.get(year);
  const list=[],add=(date,name,kind,tip,extra={})=>list.push({date:isoDay(date),name,kind,major:false,tip,...extra}),major=(date,name,kind,tip,extra={})=>add(date,name,kind,tip,{...extra,major:true}),fixed=(month,day)=>utcDay(year,month-1,day);
  const lunar=(key,name,kind,tip,extra)=>{const day=LUNAR_DATES[key][year];if(day)add(utcDay(year,Number(day.slice(0,2))-1,Number(day.slice(3))),name,kind,tip,{approx:key!=='lunarNewYear',...extra});};
  const month=(m,name,tip,isMajor=false,startDay=1,end=null)=>add(fixed(m,startDay),name,'month',tip,{major:isMajor,end:isoDay(end||utcDay(year,m,0))});
  major(fixed(1,1),'New Year’s Day','holiday','Resolutions, fresh starts, and a look back at the year.');
  add(nthWeekday(year,0,1,3),'Martin Luther King Jr. Day','holiday','A respectful note of service or reflection; skip the sales angle.');
  lunar('lunarNewYear','Lunar New Year','culture','Greetings for the new year; check which zodiac animal it is.');
  month(2,'Black History Month','Spotlight Black creators, founders, and partners all month.',true);
  add(fixed(2,2),'Groundhog Day','fun','Light “six more weeks of…” jokes tied to the brand.');
  major(nthWeekday(year,1,0,2),'Super Bowl Sunday','shopping','Game-day offers, watch-party content, and live reactions to the ads.');
  add(fixed(2,13),'Galentine’s Day','fun','Friendship-themed posts and group offers.');
  major(fixed(2,14),'Valentine’s Day','holiday','Gift guides, couples and Galentine’s angles, and last-minute offers.');
  add(nthWeekday(year,1,1,3),'Presidents’ Day','shopping','A long weekend for many; a popular sale weekend.');
  if(year%4===0&&(year%100!==0||year%400===0))add(fixed(2,29),'Leap Day','fun','A once-every-four-years offer or a “bonus day” post.');
  add(shiftDays(easterDate(year),-47),'Mardi Gras','fun','Color, food, and celebration content.');
  lunar('ramadan','Ramadan begins','culture','A respectful greeting; adjust any food or event posts. The start depends on the moon sighting.');
  month(3,'Women’s History Month','Feature women on the team, customers, and partners.',true);
  add(fixed(3,8),'International Women’s Day','holiday','Celebrate the women behind the brand.');
  major(nthWeekday(year,2,0,2),'Daylight Saving Time begins','season','Clocks spring forward at 2 AM. Double-check posts scheduled for that weekend.',{lead:7});
  add(fixed(3,14),'Pi Day','fun','Pie, math, and 3.14 deals.');
  major(fixed(3,17),'St. Patrick’s Day','holiday','Green-themed posts, luck, and limited-time offers.');
  major(seasonStart(year,0),'First day of spring','season','Spring refresh: new arrivals, cleaning, and outdoor content.');
  lunar('eid','Eid al-Fitr','culture','A warm “Eid Mubarak” greeting. The date depends on the moon sighting.');
  add(fixed(4,1),'April Fools’ Day','fun','A light, clearly-a-joke post. Avoid anything that could read as real news.');
  lunar('passover','Passover begins','culture','A respectful holiday greeting.');
  add(fixed(4,11),'National Pet Day','fun','Team pets and customer pets.');
  {const tax=fixed(4,15),day=tax.getUTCDay();add(day===6?shiftDays(tax,2):day===0?shiftDays(tax,1):tax,'Tax Day','holiday','Deadline reminders and stress-relief or deal content.');}
  add(fixed(4,22),'Earth Day','holiday','Sustainability steps the business actually takes. Avoid empty green claims.');
  major(easterDate(year),'Easter','holiday','Spring, family, and brunch content; holiday hours.');
  month(5,'Mental Health Awareness Month','Wellbeing tips and support resources.');
  month(5,'AAPI Heritage Month','Celebrate Asian American and Pacific Islander voices.');
  add(fixed(5,4),'Star Wars Day','fun','“May the 4th be with you” puns.');
  add(fixed(5,5),'Cinco de Mayo','holiday','Celebrate respectfully; skip costumes and stereotypes.');
  add(nthWeekday(year,4,2,1),'Teacher Appreciation Day','holiday','Thank-you posts and educator offers.');
  major(nthWeekday(year,4,0,2),'Mother’s Day','holiday','Gift guides, tributes, and order-by dates. Offer an opt-out for sensitive audiences.');
  major(lastWeekday(year,4,1),'Memorial Day','holiday','A respectful remembrance; sales are common but keep the tone in check. Unofficial start of summer.');
  month(6,'Pride Month','Support LGBTQ+ communities with real actions, not just a logo change.',true);
  major(nthWeekday(year,5,0,3),'Father’s Day','holiday','Gift guides, tributes, and order-by dates.');
  add(fixed(6,19),'Juneteenth','holiday','A day of reflection and celebration; keep promotions out of it.');
  major(seasonStart(year,1),'First day of summer','season','Summer launches, hours, travel, and outdoor content.');
  add(fixed(6,21),'National Selfie Day','fun','Invite followers to share selfies with the product.');
  add(fixed(6,30),'Social Media Day','fun','Thank followers and share behind-the-scenes.');
  major(fixed(7,4),'Independence Day','holiday','Red, white, and blue posts, holiday hours, and summer sales.');
  add(nthWeekday(year,6,0,3),'National Ice Cream Day','fun','Sweet treats and summer fun.');
  major(fixed(8,1),'Back-to-school season','shopping','Supply lists, routines, and back-to-school offers for families and teachers.');
  add(fixed(8,16),'National Rum Day','fun','Cocktail recipes (21+ audiences only).');
  add(fixed(8,26),'National Dog Day','fun','Team dogs and customer dogs.');
  const labor=nthWeekday(year,8,1,1);
  major(labor,'Labor Day','holiday','End-of-summer sales and holiday hours.');
  add(shiftDays(labor,6),'Grandparents Day','holiday','Family stories and multigenerational content.');
  month(9,'Hispanic Heritage Month','Celebrate Hispanic and Latino voices and partners.',true,15,utcDay(year,9,15));
  major(seasonStart(year,2),'First day of fall','season','Fall menus, cozy content, and planning ahead for the holidays.');
  add(fixed(9,29),'National Coffee Day','fun','Coffee deals and the team’s coffee orders.');
  month(10,'Breast Cancer Awareness Month','Share support and resources; donate if you use the pink ribbon.',true);
  add(fixed(10,10),'World Mental Health Day','holiday','Wellbeing tips and support resources.');
  add(nthWeekday(year,9,1,2),'Indigenous Peoples’ Day','holiday','Recognize Native communities and the land the business is on.');
  add(fixed(10,16),'Boss’s Day','fun','Team appreciation and leadership shout-outs.');
  lunar('diwali','Diwali','culture','Festival of lights greetings.');
  major(fixed(10,31),'Halloween','holiday','Costumes, team photos, spooky offers, and kid-friendly content.');
  month(11,'Native American Heritage Month','Spotlight Native creators and businesses.');
  major(nthWeekday(year,10,0,1),'Daylight Saving Time ends','season','Clocks fall back at 2 AM. Double-check posts scheduled for that weekend.',{lead:7});
  if(year%2===0)add(shiftDays(nthWeekday(year,10,1,1),1),'Election Day','holiday','Brands often go quiet or post neutral voting reminders. Pause anything that could read as political.');
  add(fixed(11,11),'Veterans Day','holiday','Thank veterans; military discounts.');
  add(fixed(11,13),'World Kindness Day','fun','Kindness challenges and community stories.');
  const thanksgiving=nthWeekday(year,10,4,4);
  major(thanksgiving,'Thanksgiving','holiday','Gratitude posts, holiday hours, and early Black Friday teasers.');
  major(shiftDays(thanksgiving,1),'Black Friday','shopping','Deals, countdowns, and the gift guide. Schedule early: feeds are crowded.');
  major(shiftDays(thanksgiving,2),'Small Business Saturday','shopping','Shop-local messages and the people behind the business.');
  major(shiftDays(thanksgiving,4),'Cyber Monday','shopping','Online-only offers and last-chance reminders.');
  major(shiftDays(thanksgiving,5),'Giving Tuesday','shopping','The causes the business supports and how followers can help.');
  lunar('hanukkah','Hanukkah begins','culture','Holiday greetings for the eight nights.',{major:true});
  major(seasonStart(year,3),'First day of winter','season','Cozy content, holiday hours, and year-end recaps.');
  major(fixed(12,24),'Christmas Eve','holiday','Last-minute gifts, holiday hours, and warm wishes.');
  major(fixed(12,25),'Christmas Day','holiday','Holiday greetings; most brands post one warm message and step back.');
  add(fixed(12,26),'Kwanzaa begins','culture','Holiday greetings for the seven days.');
  major(fixed(12,31),'New Year’s Eve','holiday','Year in review, thank-yous, and what’s coming next year.');
  list.sort((a,b)=>a.date.localeCompare(b.date)||Number(b.major)-Number(a.major));
  observanceCache.set(year,list);return list;
}
// Dates from `fromIso` (a 'YYYY-MM-DD' day) through the next `days` days, with how many days away each is.
// Awareness months already under way are left out unless `ongoing` is set.
function upcomingObservances(fromIso,days,{scope='all',ongoing=false}={}){
  const from=Date.parse(`${fromIso}T00:00:00Z`),to=from+days*86400000,year=Number(fromIso.slice(0,4)),out=[];
  for(const item of [...observancesFor(year),...observancesFor(year+1)]){
    const at=Date.parse(`${item.date}T00:00:00Z`),running=ongoing&&item.end&&at<from&&Date.parse(`${item.end}T00:00:00Z`)>=from;
    if((at>=from&&at<=to)||running){if(scope==='major'&&!item.major)continue;out.push({...item,daysAway:Math.round((at-from)/86400000)});}
  }
  return out;
}
// "in 2 weeks", "about a month away"...: how far off a date is, for reminders.
function leadPhrase(days){if(days<=0)return'today';if(days===1)return'tomorrow';if(days<7)return`in ${days} days`;if(days%7===0&&days<=28)return days===7?'next week':`in ${days/7} weeks`;if(days<=21)return`in ${days} days`;const months=Math.round(days/30.4);return months<=1?'about a month away':`about ${months} months away`;}
// eslint-disable-next-line no-undef
if(typeof module!=='undefined'&&module.exports)module.exports={OBSERVANCE_KINDS,observancesFor,upcomingObservances,leadPhrase};
