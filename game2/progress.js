/* NNY出品 · 浩源 · 浪尖儿社区 — local mastery and match history. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TankProgress=api;})(globalThis,function(){
  'use strict';
  const TYPES=['assault','guard','engineer'];
  const MISSIONS=[
    {id:'dash',type:'assault',counter:'skills',target:6,reward:30,title:'机动先锋',description:'使用疾风施放 6 次推进冲刺'},
    {id:'shield',type:'guard',counter:'blocks',target:8,reward:45,title:'正面交锋',description:'使用磐石的正面护盾格挡 8 发炮弹'},
    {id:'cover',type:'engineer',counter:'coverBlocks',target:8,reward:45,title:'战地工事',description:'使用筑垒的掩体拦截 8 发敌方炮弹'},
    {id:'defender',counter:'defenses',target:1,reward:60,title:'基地守护者',description:'完成一次五波基地守卫'}
  ];
  const number=v=>Number.isFinite(v)?Math.max(0,Math.min(1e9,v)):0;
  function normalize(source={}){
    source=source&&typeof source==='object'?source:{};
    const result={tanks:{},defenses:number(source.defenses),completed:[],seen:[],history:[]};
    for(const type of TYPES){result.tanks[type]={};for(const key of ['battles','kills','deaths','shots','hits','skills','blocks','coverBlocks','distance','wins'])result.tanks[type][key]=number(source.tanks?.[type]?.[key]);}
    result.completed=Array.isArray(source.completed)?source.completed.filter(id=>MISSIONS.some(m=>m.id===id)):[];
    result.seen=Array.isArray(source.seen)?source.seen.filter(v=>typeof v==='string').slice(-100):[];
    result.history=Array.isArray(source.history)?source.history.filter(v=>v&&TYPES.includes(v.type)&&typeof v.id==='string').slice(0,8):[];
    return result;
  }
  function missionProgress(progress,mission){return Math.min(mission.target,mission.type?progress.tanks[mission.type][mission.counter]:progress[mission.counter]);}
  function record(source,report){
    const progress=normalize(source),awards=[];
    if(!report||!TYPES.includes(report.type)||!report.id||progress.seen.includes(report.id)||!['single','coop','ranked','friend'].includes(report.mode))return {progress,awards,xp:0,recorded:false};
    const stats=report.stats||{},p=progress.tanks[report.type];p.battles++;p.kills+=number(report.kills);p.deaths+=number(report.deaths);
    for(const key of ['shots','hits','blocks','coverBlocks','distance'])p[key]+=number(stats[key]);p.skills+=number(stats.skillUses);if(report.won)p.wins++;
    if(report.won&&['single','coop'].includes(report.mode))progress.defenses++;
    for(const mission of MISSIONS)if(!progress.completed.includes(mission.id)&&missionProgress(progress,mission)>=mission.target){progress.completed.push(mission.id);awards.push(mission);}
    progress.seen.push(String(report.id));progress.seen=progress.seen.slice(-100);
    const entry={id:String(report.id),type:report.type,mode:report.mode,map:String(report.map||''),at:Number(report.at)||Date.now(),won:!!report.won,draw:!!report.draw,kills:number(report.kills),deaths:number(report.deaths),seconds:Math.round(number(report.seconds)),shots:number(stats.shots),hits:number(stats.hits),blocks:number(stats.blocks),coverBlocks:number(stats.coverBlocks),skills:number(stats.skillUses)};
    progress.history.unshift(entry);progress.history=progress.history.slice(0,8);
    return {progress,awards,xp:awards.reduce((sum,m)=>sum+m.reward,0),recorded:true};
  }
  return {MISSIONS,normalize,missionProgress,record};
});
