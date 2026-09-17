import * as THREE from 'three';
import { playerName } from './data';
import { COURT, type GameState, type PlayerState, type GameEvent, type Team, type Settings, type Athlete } from './types';

const v3 = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const clamp = THREE.MathUtils.clamp;
interface Avatar { root: THREE.Group; body: THREE.Group; leftArm: THREE.Group; rightArm: THREE.Group; leftLeg: THREE.Group; rightLeg: THREE.Group; jersey: THREE.MeshStandardMaterial; shorts: THREE.MeshStandardMaterial; ring: THREE.Mesh; label: THREE.Sprite; shadow: THREE.Mesh; height: number; }
interface Particle { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number; }

export class CourtRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(43,1,.1,160);
  private avatars = new Map<number,Avatar>();
  private ball: THREE.Group;
  private ballShadow: THREE.Mesh;
  private floor: THREE.Mesh;
  private rimNets: THREE.Group[] = [];
  private hoopGlow: THREE.Mesh[] = [];
  private particles: Particle[] = [];
  private menuPlayers: THREE.Group;
  private settings: Settings;
  private currentTeamId = '';
  private currentState: GameState | null = null;
  private lastScore = 0;
  private scoringRim = 1;
  private cameraFocus = v3();
  private shake = 0;
  private time = 0;
  private scoreLight: THREE.PointLight;
  private aimGuide: THREE.Line;
  private trail: THREE.Mesh[]=[];
  private trailHistory: THREE.Vector3[]=[];
  private labelLocale:string;
  private replaying=false;
  private arenaScreenCanvas=document.createElement('canvas');
  private arenaScreenTexture!:THREE.CanvasTexture;
  private arenaScreenKey='';
  constructor(canvas: HTMLCanvasElement, settings: Settings) {
    this.settings=settings;
    this.labelLocale=settings.locale;
    this.renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='high'?1.25:1));
    this.renderer.shadowMap.enabled=settings.quality==='high';
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.18;
    this.scene.background=new THREE.Color('#080e19');
    this.scene.fog=new THREE.FogExp2('#080e19',.012);
    this.camera.position.set(22,18,24);
    this.scene.add(new THREE.HemisphereLight('#ddeaff','#6b4826',2.1));
    const key=new THREE.DirectionalLight('#fff3da',3.0); key.position.set(-7,25,9); key.castShadow=true;
    key.shadow.mapSize.set(1024,1024); key.shadow.camera.left=-18; key.shadow.camera.right=18;
    key.shadow.camera.top=16; key.shadow.camera.bottom=-16; key.shadow.camera.far=65;
    key.shadow.normalBias=.03; key.shadow.bias=-.0001; this.scene.add(key);
    const fill=new THREE.DirectionalLight('#a3c5ff',1.5); fill.position.set(8,17,-15); this.scene.add(fill);
    this.scoreLight=new THREE.PointLight('#bdf665',0,14); this.scoreLight.position.set(12,4,0); this.scene.add(this.scoreLight);
    this.floor=this.buildCourt();
    const courtObjects=new Set(this.scene.children);this.buildArena();
    // The stands are outside the playing surface. Their shadows add a large
    // off-court pass without contributing to the players' contact shadows.
    for(const object of this.scene.children)if(!courtObjects.has(object))object.traverse(child=>{if(child instanceof THREE.Mesh){child.castShadow=false;child.receiveShadow=false;}});
    this.buildHoop(-1); this.buildHoop(1);
    this.ball=this.createBall(); this.scene.add(this.ball);
    this.ball.scale.setScalar(1.17);
    this.aimGuide=new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({length:40},()=>v3())),new THREE.LineDashedMaterial({color:'#e9ecd7',transparent:true,opacity:.38,dashSize:.12,gapSize:.2,depthWrite:false}));this.aimGuide.visible=false;this.scene.add(this.aimGuide);
    const trailGeometry=new THREE.SphereGeometry(.095,8,6);
    for(let i=0;i<9;i++){const dot=new THREE.Mesh(trailGeometry,new THREE.MeshBasicMaterial({color:'#ffc875',transparent:true,opacity:(1-i/9)*.35,depthWrite:false}));dot.visible=false;dot.scale.setScalar(1-i/12);this.trail.push(dot);this.scene.add(dot);}
    this.ballShadow=this.circle(.19,'#080d15',.3); this.ballShadow.rotation.x=-Math.PI/2; this.ballShadow.position.y=.018; this.scene.add(this.ballShadow);
    this.menuPlayers=new THREE.Group(); this.scene.add(this.menuPlayers);
    window.addEventListener('resize',this.resize);
    this.resize();
  }
  private material(color: string|number,roughness=.7,metalness=0) {return new THREE.MeshStandardMaterial({color,roughness,metalness});}
  private box(w:number,h:number,d:number,color:string|number,x:number,y:number,z:number,parent:THREE.Object3D=this.scene) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),this.material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  private cylinder(rt:number,rb:number,h:number,color:string|number,x:number,y:number,z:number,parent:THREE.Object3D,segments=12) {
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,segments),this.material(color));mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  private circle(radius:number,color:string,opacity=1) {return new THREE.Mesh(new THREE.CircleGeometry(radius,40),new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:false}));}
  private canvasTexture(canvas:HTMLCanvasElement){const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=this.renderer.capabilities.getMaxAnisotropy();return texture;}
  private courtTexture(team?:Team) {
    const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1152;
    const c=canvas.getContext('2d')!; const W=2048,H=1152;
    const X=(x:number)=>(x+15.5)/31*W, Z=(z:number)=>(z+8.75)/17.5*H;
    c.fillStyle='#171e2b';c.fillRect(0,0,W,H);
    c.fillStyle='#c49a66';c.fillRect(X(-14),Z(-7.5),X(14)-X(-14),Z(7.5)-Z(-7.5));
    let seed=24; const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let row=0;row<60;row++){const z=-7.5+row*.25;for(let col=0;col<12;col++){const x=-15+col*2.6+(row%2)*1.3;
      c.fillStyle=`rgba(${rand()>.5?'255,238,180':'103,53,17'},${.035+rand()*.07})`;c.fillRect(X(Math.max(-14,x)),Z(z),Math.max(0,X(Math.min(14,x+2.58))-X(Math.max(-14,x))),Z(z+.245)-Z(z));
      c.strokeStyle='rgba(95,52,21,.065)';c.lineWidth=.6;c.beginPath();c.moveTo(X(Math.max(-14,x)),Z(z));c.lineTo(X(Math.min(14,x+2.6)),Z(z));c.stroke();
    }}
    c.fillStyle=team?.primary??'#282442';c.fillRect(X(-14),Z(-2.45),X(-8.2)-X(-14),Z(2.45)-Z(-2.45));c.fillRect(X(8.2),Z(-2.45),X(14)-X(8.2),Z(2.45)-Z(-2.45));
    c.strokeStyle='#fff2d5';c.lineWidth=4;
    const line=(x1:number,z1:number,x2:number,z2:number)=>{c.beginPath();c.moveTo(X(x1),Z(z1));c.lineTo(X(x2),Z(z2));c.stroke();};
    const circle=(x:number,z:number,r:number,start=0,end=Math.PI*2)=>{c.beginPath();c.ellipse(X(x),Z(z),r*W/31,r*H/17.5,0,start,end);c.stroke();};
    c.strokeRect(X(-14),Z(-7.5),X(14)-X(-14),Z(7.5)-Z(-7.5));line(0,-7.5,0,7.5);circle(0,0,1.83);
    [-1,1].forEach(side=>{
      const hoop=side*12.15;
      c.strokeRect(X(side===-1?-14:8.2),Z(-2.45),X(5.8)-X(0),Z(2.45)-Z(-2.45));
      circle(side*8.2,0,1.83,side===-1?-Math.PI/2:Math.PI/2,side===-1?Math.PI/2:Math.PI*1.5);
      c.setLineDash([12,12]);circle(side*8.2,0,1.83,side===-1?Math.PI/2:-Math.PI/2,side===-1?Math.PI*1.5:Math.PI/2);c.setLineDash([]);
      const radius=6.75,cornerZ=6.7,dx=Math.sqrt(radius*radius-cornerZ*cornerZ),angle=Math.acos(dx/radius);
      if(side===1)circle(hoop,0,radius,Math.PI-angle,Math.PI+angle);else circle(hoop,0,radius,-angle,angle);
      line(side*14,-cornerZ,hoop-side*dx,-cornerZ);line(side*14,cornerZ,hoop-side*dx,cornerZ);
      circle(hoop,0,1.25,side===-1?-Math.PI/2:Math.PI/2,side===-1?Math.PI/2:Math.PI*1.5);
      for(const z of [-2.65,2.65])for(const x of [10.2,11,11.8])line(side*x,z,side*x,z+(z<0?-.18:.18));
    });
    c.save();c.translate(X(0),Z(0));c.fillStyle=team?.primary??'#282442';c.beginPath();c.arc(0,0,87,0,Math.PI*2);c.fill();c.strokeStyle=team?.secondary??'#c4f77a';c.lineWidth=3;c.stroke();c.fillStyle='#fff4da';c.textAlign='center';c.textBaseline='middle';c.font='900 61px Arial';c.fillText(team?.abbr??'AH',0,2);c.restore();
    c.fillStyle='#f0e8d9';c.textAlign='center';c.font='800 35px Arial';
    c.save();c.translate(X(-14.8),Z(0));c.rotate(-Math.PI/2);c.fillText(team?`${team.city} ${team.name}`.toUpperCase():'AFTER HOURS',0,0);c.restore();
    c.save();c.translate(X(14.8),Z(0));c.rotate(Math.PI/2);c.fillText(team?`${team.city} ${team.name}`.toUpperCase():'AFTER HOURS',0,0);c.restore();
    c.font='800 23px Arial';c.fillStyle='#202635';c.fillText('N B A   A F T E R   H O U R S',X(0),Z(6.45));
    c.fillStyle='#bfed6a';c.font='700 20px Arial';c.fillText('THE COURT IS YOURS',X(-7),Z(-8.0));c.fillText('EVERY POSSESSION MATTERS',X(7),Z(-8.0));
    return this.canvasTexture(canvas);
  }
  private buildCourt(){
    this.box(34,.26,20,'#0c111a',0,-.19,0);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(31,17.5),new THREE.MeshStandardMaterial({map:this.courtTexture(),roughness:.4,metalness:.08}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;this.scene.add(floor);
    const trim=this.box(31.3,.035,17.8,'#a07642',0,-.045,0);trim.receiveShadow=true;
    return floor;
  }
  private banner(text:string,color='#bff36b',w=1024,h=96){
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const c=canvas.getContext('2d')!;
    c.fillStyle='#101a27';c.fillRect(0,0,w,h);c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';let size=h*.45;c.font=`800 ${size}px Arial`;while(c.measureText(text).width>w*.92&&size>9){size-=2;c.font=`800 ${size}px Arial`;}c.fillText(text,w/2,h/2);return this.canvasTexture(canvas);
  }
  private buildArena(){
    this.box(70,.6,65,'#0b111b',0,-.7,0);
    // Far-side seating, with individually colored supporters in inexpensive instanced meshes.
    const crowdGeometry=new THREE.BoxGeometry(.35,.58,.3);
    const crowd=new THREE.InstancedMesh(crowdGeometry,new THREE.MeshLambertMaterial({color:'#626a76'}),640);
    const head=new THREE.InstancedMesh(new THREE.SphereGeometry(.135,6,4),new THREE.MeshLambertMaterial({color:'#694e3e'}),640);
    const dummy=new THREE.Object3D();let index=0;
    const colors=['#555369','#8a7860','#30394f','#b9b5a1','#797a87','#564166','#535e6e','#728485'];
    for(const side of [-1,1])for(let row=0;row<8;row++){
      const y=.8+row*.7,z=side*(11.3+row*.8);
      this.box(42,.55,.86,row%2?'#151e2c':'#1b2536',0,y-.4,z);
      for(let seat=0;seat<40;seat++){
        const x=(seat-19.5)*.99;dummy.position.set(x,y+.14,z);dummy.rotation.set(0,0,0);dummy.updateMatrix();crowd.setMatrixAt(index,dummy.matrix);crowd.setColorAt(index,new THREE.Color(colors[(seat*3+row*7)%colors.length]));
        dummy.position.y+=.44;dummy.updateMatrix();head.setMatrixAt(index,dummy.matrix);index++;
      }
    }
    this.scene.add(crowd,head);
    for(const side of [-1,1]){
      this.box(35,.8,.24,'#17212f',0,.4,side*9.7);
      const board=new THREE.Mesh(new THREE.PlaneGeometry(34,.68),new THREE.MeshBasicMaterial({map:this.banner('AFTER HOURS     /     OWN THE MOMENT     /     NBA BASKETBALL     /     AFTER HOURS')}));
      board.position.set(0,.48,side*9.55);if(side===1)board.rotation.y=Math.PI;this.scene.add(board);
      const strip=new THREE.Mesh(new THREE.BoxGeometry(35,.035,.04),new THREE.MeshBasicMaterial({color:'#b9f260'}));strip.position.set(0,.9,side*9.5);this.scene.add(strip);
      if(side===-1)for(const x of [-22,22]){
        this.box(.25,17,.25,'#252e3c',x,8,side*17);
        const fixture=this.box(4,.13,.6,'#dce7f9',x,16,side*17);(fixture.material as THREE.MeshStandardMaterial).emissive.set('#b9d8ff');(fixture.material as THREE.MeshStandardMaterial).emissiveIntensity=2;
      }
    }
    // Scorer's table and benches.
    this.box(7,.8,1,'#1d2839',0,.4,-9.1);
    for(const x of [-10,-9,-8,8,9,10]){this.box(.58,.1,.6,'#26374d',x,.48,-9.05);this.box(.58,.6,.08,'#26374d',x,.78,-9.34);}
    this.arenaScreenCanvas.width=1024;this.arenaScreenCanvas.height=512;
    this.arenaScreenTexture=this.canvasTexture(this.arenaScreenCanvas);this.updateArenaScreens(null);
    for(const x of [-19,19]){
      const screen=new THREE.Mesh(new THREE.PlaneGeometry(7,3.5),new THREE.MeshBasicMaterial({map:this.arenaScreenTexture}));screen.position.set(x,6,-8.8);screen.rotation.y=x>0?-.35:.35;this.scene.add(screen);
    }
  }
  private updateArenaScreens(state:GameState|null){
    const key=state?`${state.config.home.id}/${state.config.away.id}/${state.score}/${state.quarter}/${Math.ceil(state.clock)}/${this.replaying}/${this.settings.locale}`:'menu';
    if(key===this.arenaScreenKey)return;this.arenaScreenKey=key;
    const c=this.arenaScreenCanvas.getContext('2d')!,w=1024,h=512;
    c.fillStyle='#081320';c.fillRect(0,0,w,h);
    c.fillStyle='#c8ef82';c.fillRect(36,32,w-72,5);c.fillRect(36,h-37,w-72,5);
    c.textAlign='center';c.textBaseline='middle';c.fillStyle='#acb9ba';c.font='700 29px Arial';c.fillText('NBA  /  AFTER HOURS',w/2,82);
    if(state){
      const home=state.config.home,away=state.config.away;
      for(const [i,team] of [home,away].entries()){
        const x=i===0?265:759;c.fillStyle=team.primary;c.fillRect(x-177,138,354,49);c.fillStyle='#fff2d8';c.font='800 35px Arial';c.fillText(team.abbr,x,163);c.font='900 162px Arial';c.fillText(String(state.score[i]),x,292);
      }
      c.fillStyle='#677881';c.font='800 55px Arial';c.fillText(':',512,285);
      c.fillStyle='#c8ef82';c.font='700 29px "Microsoft YaHei", Arial';const seconds=Math.ceil(state.clock),zh=this.settings.locale==='zh';const clock=state.config.mode==='practice'?(zh?'自由训练':'FREE PRACTICE'):`${state.quarter<=4?'Q'+state.quarter:'OT'+(state.quarter-4)}  ·  ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;c.fillText(this.replaying?(zh?'精彩回放':'INSTANT REPLAY'):clock,512,421);
    }else{
      c.fillStyle='#f3f0df';c.font='900 93px Arial';c.fillText('OWN THE',512,225);c.fillText('MOMENT.',512,331);c.fillStyle='#718896';c.font='700 23px Arial';c.fillText('30 TEAMS   /   ONE COURT',512,421);
    }
    this.arenaScreenTexture.needsUpdate=true;
  }
  private buildHoop(side:number){
    const x=side*COURT.hoopX;
    this.box(1.7,.5,2,'#142033',side*15.2,.25,0);
    const pole=this.box(.27,3.9,.3,'#aeb6c0',side*14.75,2.1,0);pole.rotation.z=side*.12;
    this.box(2.1,.18,.18,'#aeb6c0',side*13.5,3.78,0);
    this.box(.16,1.2,2.1,'#dae4ec',side*12.8,3.65,0);
    const glass=this.box(.175,1.07,1.95,'#658698',side*12.78,3.66,0);(glass.material as THREE.MeshStandardMaterial).transparent=true;(glass.material as THREE.MeshStandardMaterial).opacity=.48;
    for(const z of [-.95,.95])this.box(.2,1.16,.05,'#e5e9e9',side*12.74,3.64,z);
    for(const y of [3.08,4.23])this.box(.2,.04,1.95,'#e5e9e9',side*12.74,y,0);
    for(const z of [-.3,.3])this.box(.21,.46,.035,'#f9f1d9',side*12.67,3.4,z);
    for(const y of [3.18,3.64])this.box(.21,.035,.63,'#f9f1d9',side*12.67,y,0);
    this.box(.5,.07,.09,'#f36732',side*12.48,3.05,0);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.235,.027,8,40),this.material('#f35d26',.4,.25));rim.rotation.x=Math.PI/2;rim.position.set(x,3.05,0);rim.castShadow=true;this.scene.add(rim);
    const net=new THREE.Group();net.position.set(x,3.04,0);this.scene.add(net);this.rimNets.push(net);
    const points:THREE.Vector3[]=[];
    for(let i=0;i<12;i++){
      const a=i/12*Math.PI*2,b=(i+1)/12*Math.PI*2;
      points.push(v3(Math.cos(a)*.23,0,Math.sin(a)*.23),v3(Math.cos(b)*.17,-.38,Math.sin(b)*.17));
      points.push(v3(Math.cos(a)*.23,0,Math.sin(a)*.23),v3(Math.cos(a-Math.PI/6)*.17,-.38,Math.sin(a-Math.PI/6)*.17));
    }
    net.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#eae8d8',transparent:true,opacity:.8})));
    const glow=new THREE.Mesh(new THREE.RingGeometry(.3,.37,48),new THREE.MeshBasicMaterial({color:'#c6fa78',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));glow.position.set(x,.025,0);glow.rotation.x=-Math.PI/2;this.scene.add(glow);this.hoopGlow.push(glow);
  }
  private createBall(){
    const group=new THREE.Group();const sphere=new THREE.Mesh(new THREE.SphereGeometry(.135,20,14),this.material('#e98135',.83));sphere.castShadow=true;group.add(sphere);
    const seamMaterial=new THREE.MeshBasicMaterial({color:'#402817'});
    for(let i=0;i<3;i++){const seam=new THREE.Mesh(new THREE.TorusGeometry(.136,.003,4,48),seamMaterial);if(i===1)seam.rotation.x=Math.PI/2;if(i===2)seam.rotation.y=Math.PI/2;group.add(seam);}
    return group;
  }
  private labelTexture(text:string,color:string,background='#101a25'){
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const c=canvas.getContext('2d')!;
    c.fillStyle=background;c.beginPath();c.roundRect(2,2,252,60,12);c.fill();c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';let size=30;c.font=`bold ${size}px "Microsoft YaHei", Arial`;while(c.measureText(text).width>230&&size>16){size--;c.font=`bold ${size}px "Microsoft YaHei", Arial`;}c.fillText(text,128,34);return this.canvasTexture(canvas);
  }
  private createAvatar(athlete:Athlete,team:Team,side:number):Avatar{
    const root=new THREE.Group(),body=new THREE.Group();root.add(body);
    const skin=athlete.skin||'#965e40'; const uniform=side===0?team.primary:'#e6e5df';
    const jersey=this.material(uniform),shorts=this.material(uniform);
    const torso=new THREE.Mesh(new THREE.CylinderGeometry(.235,.19,.54,10),jersey);torso.position.y=1.28;torso.scale.z=.76;torso.castShadow=true;body.add(torso);
    const chest=this.box(.36,.08,.3,team.secondary,0,1.48,0,body);chest.scale.x=1.12;
    this.cylinder(.085,.1,.1,skin,0,1.59,0,body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.16,12,10),this.material(skin));head.scale.set(.92,1.15,.96);head.position.set(0,1.77,0);head.castShadow=true;body.add(head);
    if(athlete.hair!=='bald'){
      const hair=new THREE.Mesh(new THREE.SphereGeometry(athlete.hair==='curly'?.164:.159,12,8,0,Math.PI*2,0,1.52),this.material('#201c1b'));hair.position.set(0,1.81,0);hair.scale.y=athlete.hair==='curly'?.95:.62;body.add(hair);
    }
    const nose=new THREE.Mesh(new THREE.SphereGeometry(.026,6,4),this.material(skin));nose.position.set(0,1.77,.15);body.add(nose);
    for(const x of [-.052,.052]){const eye=this.box(.018,.014,.007,'#221c1a',x,1.81,.142,body);eye.castShadow=false;}
    const shortMesh=new THREE.Mesh(new THREE.CylinderGeometry(.205,.255,.32,8),shorts);shortMesh.position.y=.91;shortMesh.scale.z=.82;shortMesh.castShadow=true;body.add(shortMesh);
    const arm=(side:number)=>{const pivot=new THREE.Group();pivot.position.set(side*.245,1.46,0);body.add(pivot);this.cylinder(.064,.052,.39,skin,0,-.16,0,pivot);const forearm=this.cylinder(.052,.038,.34,skin,0,-.49,.025,pivot);forearm.rotation.x=-.16;const hand=new THREE.Mesh(new THREE.SphereGeometry(.06,8,6),this.material(skin));hand.position.set(0,-.66,.055);pivot.add(hand);return pivot;};
    const leg=(side:number)=>{const pivot=new THREE.Group();pivot.position.set(side*.12,.87,0);body.add(pivot);this.cylinder(.086,.061,.4,skin,0,-.22,0,pivot);this.cylinder(.063,.043,.35,skin,0,-.57,0,pivot);this.cylinder(.045,.047,.11,'#e8e6df',0,-.72,0,pivot);this.box(.13,.11,.25,side===-1?team.secondary:'#f5f1e7',0,-.81,.035,pivot);return pivot;};
    const leftArm=arm(-1),rightArm=arm(1),leftLeg=leg(-1),rightLeg=leg(1);
    const number=new THREE.Mesh(new THREE.PlaneGeometry(.25,.15),new THREE.MeshBasicMaterial({map:this.labelTexture(String(athlete.number),side===0?'#fff7df':team.primary,uniform),transparent:true}));number.position.set(0,1.3,.182);body.add(number);
    const back=number.clone();back.position.z=-.18;back.rotation.y=Math.PI;body.add(back);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.36,.43,40),new THREE.MeshBasicMaterial({color:side===0?'#c0f877':'#fa8354',transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.025;root.add(ring);
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:this.labelTexture(this.settings.locale==='zh'?playerName(athlete,'zh'):athlete.shortName.toUpperCase(),'#f8f6e6'),transparent:true,depthTest:false}));label.scale.set(1.9,.43,1);label.position.set(0,2.35,0);root.add(label);
    const shadow=this.circle(.32,'#080c13',.18);shadow.rotation.x=-Math.PI/2;shadow.position.y=.02;root.add(shadow);
    const scale=athlete.height/1.97;body.scale.setScalar(scale);
    return {root,body,leftArm,rightArm,leftLeg,rightLeg,jersey,shorts,ring,label,shadow,height:scale};
  }
  setMatch(state:GameState){
    this.currentState=state;
    for(const a of this.avatars.values()){this.scene.remove(a.root);this.disposeObject(a.root);}this.avatars.clear();
    this.menuPlayers.visible=false;
    for(const player of state.players){const avatar=this.createAvatar(player.athlete,player.side===0?state.config.home:state.config.away,player.side);this.avatars.set(player.id,avatar);this.scene.add(avatar.root);}
    if(this.currentTeamId!==state.config.home.id){const mat=this.floor.material as THREE.MeshStandardMaterial;mat.map?.dispose();mat.map=this.courtTexture(state.config.home);mat.needsUpdate=true;this.currentTeamId=state.config.home.id;}
    this.cameraFocus.set(0,0,0);this.lastScore=0;this.trailHistory=[];
  }
  setMenu(home:Team,away:Team){
    this.currentState=null;
    for(const a of this.avatars.values())a.root.visible=false;
    this.disposeObject(this.menuPlayers);this.menuPlayers.clear();this.menuPlayers.visible=true;
    const positions=[[6,2.2,home,0],[8,-.5,away,1],[3,-3,home,0],[10,3.8,away,1]] as const;
    positions.forEach(([x,z,team,side],i)=>{const a=this.createAvatar(team.players[i%team.players.length],team,side);a.root.position.set(x,0,z);a.root.rotation.y=i%2?-1.2:1.8;a.label.visible=false;a.ring.visible=false;this.menuPlayers.add(a.root);});
    this.ball.visible=true;this.ball.position.set(6,.6,2.8);
  }
  settingsChanged(settings:Settings){
    if(settings.locale!==this.labelLocale){
      this.labelLocale=settings.locale;
      for(const p of this.currentState?.players??[]){const a=this.avatars.get(p.id);if(a){a.label.material.map?.dispose();a.label.material.map=this.labelTexture(settings.locale==='zh'?playerName(p.athlete,'zh'):p.athlete.shortName.toUpperCase(),'#f8f6e6');a.label.material.needsUpdate=true;}}
    }
    this.settings=settings;this.renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='high'?1.25:1));this.renderer.shadowMap.enabled=settings.quality==='high';
  }
  stats(){return {calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,pixelRatio:this.renderer.getPixelRatio()};}
  setReplay(active:boolean){this.replaying=active;this.trailHistory=[];}
  resize=()=>{const width=window.innerWidth,height=window.innerHeight;this.renderer.setSize(width,height,true);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();};
  event(event:GameEvent){
    if(event.type==='score'||event.type==='dunk'||event.type==='perfect'){
      const side=event.side??0;let x=side===0?COURT.hoopX:-COURT.hoopX,z=0,y=3.1;
      if(event.type==='score'){this.scoreLight.position.x=x;this.scoreLight.intensity=12;this.lastScore=1;this.scoringRim=side===0?1:0;}
      if(event.type==='perfect'){const shooter=this.currentState?.players.find(p=>p.id===event.player);if(shooter){x=shooter.x;z=shooter.z;y=2.2+shooter.jump;}}
      if(event.type==='dunk'&&!this.settings.reducedMotion)this.shake=.15;
      if(event.type!=='dunk'&&!this.settings.reducedMotion)for(let i=0;i<(event.type==='perfect'?14:10);i++){
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(.07,.04,.07),new THREE.MeshBasicMaterial({color:event.type==='perfect'?'#c8fa76':'#ffbc69',transparent:true}));mesh.position.set(x,y,z);this.scene.add(mesh);const life=.7+Math.random()*.5;this.particles.push({mesh,velocity:v3((Math.random()-.5)*2,2+Math.random()*2,(Math.random()-.5)*2),life,maxLife:life});
      }
    }
  }
  update(state:GameState|null,dt:number){
    this.time+=dt;
    this.updateArenaScreens(state);
    this.aimGuide.visible=false;
    if(state){
      for(const p of state.players)this.updateAvatar(p,state);
      const ball=state.ball;this.ball.visible=true;this.ball.position.set(ball.x,Math.max(.14,ball.y),ball.z);
      if(ball.state==='dead'&&ball.made&&ball.progress>=1){const t=state.phase==='inbound'?Math.max(0,1.15-state.phaseTime):1.15;const fall=Math.max(.17,COURT.hoopY-7*t*t);this.ball.position.y=t>.65?.17+Math.abs(Math.sin((t-.65)*12))*.45*Math.exp(-(t-.65)*4):fall;}
      if(ball.state==='held'&&ball.owner!==null){const owner=state.players.find(p=>p.id===ball.owner);if(owner){const a=this.avatars.get(owner.id);const dribble=state.charging?1.65+owner.jump:.22+Math.abs(Math.sin(this.time*10))* .67;this.ball.position.set(owner.x+Math.cos(owner.facing)*.3,dribble,owner.z-Math.sin(owner.facing)*.3);if(a&&state.charging)a.rightArm.rotation.x=-2.5;}}
      this.ball.rotation.x+=dt*7;this.ball.rotation.z+=dt*4;
      this.ballShadow.position.set(this.ball.position.x,.019,this.ball.position.z);this.ballShadow.scale.setScalar(1+this.ball.position.y*.1);
      (this.ballShadow.material as THREE.MeshBasicMaterial).opacity=.28/(1+this.ball.position.y*.6);
      if(state.charging){
        const shooter=state.players.find(p=>p.id===state.ball.owner);
        if(shooter){const targetX=shooter.side===0?COURT.hoopX:-COURT.hoopX,d=Math.hypot(targetX-shooter.x,shooter.z),positions=this.aimGuide.geometry.attributes.position;
          for(let i=0;i<40;i++){const t=i/39;positions.setXYZ(i,shooter.x+(targetX-shooter.x)*t,2+(COURT.hoopY-2)*t+Math.sin(t*Math.PI)*(1.3+d*.18),shooter.z*(1-t));}
          positions.needsUpdate=true;this.aimGuide.computeLineDistances();this.aimGuide.visible=true;
          (this.aimGuide.material as THREE.LineDashedMaterial).color.set(state.charge>=.625&&state.charge<=.775?'#c6fa76':'#e9ecd7');
        }
      }
      const owner=state.players.find(p=>p.id===state.controlled);
      const narrow=this.camera.aspect<1.25;
      const follow=owner?owner.x*.45+ball.x*.15:ball.x*.5;
      const focusX=this.replaying?clamp(ball.x*.86,-10,10):state.config.localMultiplayer?0:narrow?clamp(follow*1.5,-9,9):clamp(follow,-3.4,3.4);
      this.cameraFocus.lerp(v3(focusX,0,0),1-Math.exp(-dt*2));
      let target:THREE.Vector3;
      if(this.replaying)target=v3(this.cameraFocus.x+2,11,narrow?24:17);
      else if(this.settings.camera==='overhead')target=v3(this.cameraFocus.x,34,narrow?16:10);
      else if(this.settings.camera==='courtside')target=v3(this.cameraFocus.x-1,13,narrow?36:23);
      else target=v3(this.cameraFocus.x,narrow?21:19,narrow?31:23);
      if(state.config.localMultiplayer&&!this.replaying){target.y+=3;target.z+=3;}
      if(!this.settings.reducedMotion&&this.shake>0){target.x+=(Math.random()-.5)*this.shake;target.y+=(Math.random()-.5)*this.shake;this.shake*=.9;}
      this.camera.position.lerp(target,1-Math.exp(-dt*3));this.camera.lookAt(this.cameraFocus.x,0,0);
    }else{
      const offset=this.settings.reducedMotion?0:Math.sin(this.time*.1)*1.4;
      const target=v3(22+offset,18,24);this.camera.position.lerp(target,1-Math.exp(-dt*1.8));this.camera.lookAt(4,0,0);
      this.ball.position.y=.22+Math.abs(Math.sin(this.time*7))*.7;
      this.ballShadow.position.set(this.ball.position.x,.019,this.ball.position.z);
    }
    const flight=!!state&&(state.ball.state==='shot'||state.ball.state==='pass');
    if(flight&&!this.settings.reducedMotion){
      if(dt>0)this.trailHistory.unshift(this.ball.position.clone());this.trailHistory=this.trailHistory.slice(0,27);
      this.trail.forEach((dot,i)=>{const point=this.trailHistory[i*3+2];dot.visible=!!point;if(point)dot.position.copy(point);});
    }else{this.trailHistory=[];this.trail.forEach(dot=>dot.visible=false);}
    this.lastScore=Math.max(0,this.lastScore-dt);this.scoreLight.intensity*=Math.exp(-dt*5);
    this.rimNets.forEach((n,i)=>{const pulse=i===this.scoringRim?this.lastScore:0;n.scale.x=1+Math.sin(this.time*30)*pulse*.08;n.scale.y=1+Math.sin(this.time*23)*pulse*.2;});
    this.hoopGlow.forEach((glow,i)=>{(glow.material as THREE.MeshBasicMaterial).opacity=i===this.scoringRim?this.lastScore*.7:0;glow.scale.setScalar(1+(1-this.lastScore)*4);});
    this.particles=this.particles.filter(p=>{p.life-=dt;if(p.life<=0){this.scene.remove(p.mesh);p.mesh.geometry.dispose();(p.mesh.material as THREE.Material).dispose();return false;}p.velocity.y-=dt*5;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.rotation.x+=dt*8;(p.mesh.material as THREE.MeshBasicMaterial).opacity=p.life/p.maxLife;return true;});
    this.renderer.render(this.scene,this.camera);
  }
  private updateAvatar(p:PlayerState,state:GameState){
    const a=this.avatars.get(p.id);if(!a)return;a.root.visible=true;
    a.root.position.set(p.x,0,p.z);
    let delta=p.facing-a.body.rotation.y;while(delta>Math.PI)delta-=Math.PI*2;while(delta<-Math.PI)delta+=Math.PI*2;a.body.rotation.y+=delta*.23;
    const moving=Math.hypot(p.vx,p.vz),cycle=this.time*(moving>5?15:11)+p.id;
    const running=Math.min(1,moving/3),stride=Math.sin(cycle)*.6*running;
    a.leftLeg.rotation.x=stride;a.rightLeg.rotation.x=-stride;
    a.leftArm.rotation.x=-stride*.7;a.rightArm.rotation.x=stride*.7;
    if(state.ball.owner===p.id&&!state.charging)a.rightArm.rotation.x=-.22-Math.sin(this.time*10)*.16;
    a.leftArm.rotation.z=.1;a.rightArm.rotation.z=-.1;
    a.body.position.y=p.jump+Math.abs(Math.sin(cycle))*running*.045;
    a.body.rotation.z=p.action==='crossover'?Math.sin(this.time*18)*.12:0;
    if(p.action==='shoot'||p.action==='dunk'){a.leftArm.rotation.x=-2.65;a.rightArm.rotation.x=-2.8;a.rightLeg.rotation.x=-.2;a.leftLeg.rotation.x=.2;}
    if(p.action==='block'){a.leftArm.rotation.x=-2.9;a.rightArm.rotation.x=-2.9;a.leftArm.rotation.z=-.25;a.rightArm.rotation.z=.25;}
    if(p.action==='steal'){a.rightArm.rotation.x=-1.3;a.rightArm.rotation.z=-.5;}
    if(p.side!==state.possession&&moving<2){a.leftArm.rotation.z=.5;a.rightArm.rotation.z=-.5;}
    const controlled=p.id===state.controlled||!!state.config.localMultiplayer&&p.id===state.controlledAway;
    a.ring.visible=controlled||p.id===state.ball.owner;
    (a.ring.material as THREE.MeshBasicMaterial).opacity=controlled?.95:.25;
    a.ring.scale.setScalar(controlled?1.1:1);
    a.label.visible=controlled||p.id===state.ball.owner;
    a.label.position.y=2.3*a.height+p.jump;
    a.shadow.scale.setScalar(Math.max(.6,1-p.jump*.15));
  }
  private disposeObject(object:THREE.Object3D){const materials=new Set<THREE.Material>();const textures=new Set<THREE.Texture>();object.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Sprite){if(o instanceof THREE.Mesh)o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);if('map'in m&&m.map)textures.add(m.map as THREE.Texture);}}});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());}
  dispose(){window.removeEventListener('resize',this.resize);this.scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Sprite){if(o instanceof THREE.Mesh)o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{if('map'in m)(m.map as THREE.Texture|null)?.dispose();m.dispose();});}});this.renderer.dispose();}
}
