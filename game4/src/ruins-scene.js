import * as THREE from 'three';
import { SHIP_POSITION } from './observation-camera.js';
export function createRuinsScene(scene,camera,choose,port) {
  const group=new THREE.Group();group.visible=false;scene.add(group);
  const ids=['star','ring','core'],names=['集光器','中继环','灯塔核心'];
  const positions=[new THREE.Vector3(-82,72,0),new THREE.Vector3(0,95,0),new THREE.Vector3(82,72,0)];
  const geometries=[new THREE.OctahedronGeometry(12),new THREE.TorusGeometry(12,3,8,24),new THREE.CylinderGeometry(7,12,26,8)];
  const nodes=geometries.map((g,i)=>{const n=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0x65738d,wireframe:true}));n.position.copy(positions[i]);group.add(n);return n;});
  const lines=[0,1].map(i=>{const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([positions[i],positions[i+1]]),new THREE.LineBasicMaterial({color:0x293447}));group.add(l);return l;});
  const candidate=new THREE.Line(new THREE.BufferGeometry().setFromPoints([positions[0],positions[1]]),new THREE.LineDashedMaterial({color:0xe5ce83,dashSize:4,gapSize:3}));candidate.computeLineDistances();group.add(candidate);
  const spark=new THREE.Mesh(new THREE.SphereGeometry(3,8,6),new THREE.MeshBasicMaterial({color:0xc8fff1}));group.add(spark);
  const standby=new THREE.Mesh(new THREE.SphereGeometry(2,8,6),new THREE.MeshBasicMaterial({color:0xffd785}));group.add(standby);
  const ship=new THREE.Group();ship.position.copy(SHIP_POSITION);group.add(ship);
  const hull=new THREE.Mesh(new THREE.ConeGeometry(7,30,6),new THREE.MeshBasicMaterial({color:0x8dc5ce,wireframe:true}));hull.rotation.z=-Math.PI/2;ship.add(hull);
  const wings=new THREE.Mesh(new THREE.BoxGeometry(10,2,40),new THREE.MeshBasicMaterial({color:0x719ba7,wireframe:true}));ship.add(wings);
  const direction=ship.position.clone().sub(positions[2]),length=direction.length();
  const beam=new THREE.Mesh(new THREE.ConeGeometry(18,length,16,1,true),new THREE.MeshBasicMaterial({color:0x91ffda,transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false}));
  beam.position.copy(positions[2]).addScaledVector(direction,.5);beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),direction.normalize());group.add(beam);
  let current;
  const labels=names.map((name,i)=>{const el=document.createElement('button');el.className='ruin-marker';el.hidden=true;el.dataset.part=ids[i];
    el.onclick=()=>{if(current?.wiring)port(current.draft.from && current.draft.from!==ids[i]?'in':'out',ids[i]);else choose(ids[i]);};document.body.append(el);return el;});
  const shipLabel=document.createElement('div');shipLabel.className='story-marker';shipLabel.hidden=true;shipLabel.textContent='失联飞船 · 没有回应';document.body.append(shipLabel);
  const projected=new THREE.Vector3(),vector=new THREE.Vector3();
  function label(el,p,active){projected.copy(p).project(camera);el.hidden=!active||projected.z< -1||projected.z>1||Math.abs(projected.x)>.94||Math.abs(projected.y)>.87;el.style.left=`${(projected.x+1)*50}%`;el.style.top=`${(1-projected.y)*50}%`;if(active&&innerWidth<=900){const hud=document.getElementById('ui-layer').getBoundingClientRect();const x=(projected.x+1)*innerWidth/2,y=(1-projected.y)*innerHeight/2; if(x-65<hud.right&&x+65>hud.left&&y+60>hud.top&&y<hud.bottom)el.hidden=true;}}
  return {update(c){
    current=c;const active=c.route==='追寻回响',now=performance.now();group.visible=active;
    const links=c.links||[], powered=['star',...(links.includes('star:ring')?['ring']:[]),...(links.includes('ring:core')?['core']:[])];
    const p=c.pulse,t=p?(now-p.start)/1800:0,failing=p&&!p.success&&t<1.5;
    shipLabel.textContent=c.shipStage===2?'失联飞船 · 记录已回收':c.shipStage===1?'失联飞船 · 等待回收记录':'失联飞船 · 请定位并扫描';
    beam.visible=ship.visible=active&&c.scanned;label(shipLabel,ship.position,active&&c.scanned);
    nodes.forEach((node,i)=>{
      const selected=c.ruinTarget===ids[i]||c.draft?.from===ids[i]||c.draft?.to===ids[i];
      node.material.color.setHex(failing&&p.to===ids[i]?0x815879:powered.includes(ids[i])?0x7affcf:selected?0xffd782:(c.inspected||[]).includes(ids[i])?0x92d7ff:0x65738d);
      node.scale.setScalar(selected?1.13:1);const el=labels[i];label(el,positions[i],active);
      el.textContent=`${names[i]} · ${c.wiring?(c.draft.from===ids[i]?'输出端 · 起点':c.draft.to===ids[i]?'输入端 · 终点':c.draft.from?'输入端 · 可选择':'输出端 · 可选择'):c.scanned?'已供能':selected?'已选中':'检查'}`;
      el.title=c.wiring&&c.draft.from===ids[i]?'再次点击取消输出端':c.wiring&&c.draft.to===ids[i]?'再次点击取消输入端':'';
      el.setAttribute('aria-label',el.textContent);el.disabled=!!p?.pending||!!c.scanned;el.setAttribute('aria-pressed',String(selected));
    });
    lines.forEach((line,i)=>line.material.color.setHex(links.includes(`${ids[i]}:${ids[i+1]}`)?0x7affcf:(now%1800<250?0x56675b:0x293447)));
    standby.visible=active&&!c.scanned;
    standby.position.lerpVectors(new THREE.Vector3(-125,72,0),positions[0],(now%2200)/2200);
    const from=c.draft?.from,to=c.draft?.to;candidate.visible=active&&!!from&&!!to;
    if(candidate.visible){const attr=candidate.geometry.attributes.position;attr.setXYZ(0,...positions[ids.indexOf(from)].toArray());attr.setXYZ(1,...positions[ids.indexOf(to)].toArray());attr.needsUpdate=true;candidate.geometry.computeBoundingSphere();candidate.computeLineDistances();candidate.material.color.setHex(failing?0xff918a:0xe5ce83);}
    spark.visible=active&&!!p&&t<=1;
    if(spark.visible){const progress=p.success?Math.min(1,t):t<.55?t/.55*.8:Math.max(0,(1-t)/.45*.8);spark.material.color.setHex(p.success?0xafffee:0xff918a);vector.lerpVectors(positions[ids.indexOf(p.from)],positions[ids.indexOf(p.to)],progress);if(p.from===p.to)vector.y+=Math.sin(progress*Math.PI)*20;spark.position.copy(vector);}
  }};
}
