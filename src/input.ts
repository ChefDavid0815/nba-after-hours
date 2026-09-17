import { EMPTY_INPUT, type InputFrame, type Locale } from './types';

export class GameInput {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private gamepadPrevious: boolean[] = [];
  private secondaryGamepadPrevious:boolean[]=[];
  private multiplayer=false;
  private ignoreSecondaryUntilRelease=false;
  private systemStartDown=false;
  private menuConfirmDown=false;
  private menuBackDown=false;
  private replayButtonDown=false;
  private nextMenuMove=0;
  private ignoreGamepadUntilRelease=false;
  private touchMove = { x: 0, z: 0 };
  private touchKeys = new Set<string>();
  private touchRoot: HTMLDivElement;
  private locale:Locale='zh';
  private touchOffense=true;
  active = false;
  onPause = () => {};
  onCamera = () => {};
  onMute = () => {};
  onFullscreen = () => {};
  onReplay = () => {};
  onGesture = () => {};
  constructor() {
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    window.addEventListener('pointerdown', () => this.onGesture(), { passive: true });
    this.touchRoot = document.createElement('div');
    this.touchRoot.className = 'touch-controls';
    this.touchRoot.innerHTML = `<div class="touch-stick" aria-label="移动"><div class="touch-stick-knob"></div></div><div class="touch-actions"><button data-key="KeyL" class="touch-screen"></button><button data-key="ShiftLeft" class="touch-sprint"></button><button data-key="KeyK" class="touch-skill"></button><button data-key="KeyJ" class="touch-pass"></button><button data-key="Space" class="touch-shoot"></button></div>`;
    document.body.append(this.touchRoot);
    this.setupTouch();
    this.updateTouchLabels();
  }
  private keyDown = (event: KeyboardEvent) => {
    const element = event.target instanceof HTMLElement ? event.target : null;
    if (element?.matches('input,select,textarea') && event.code !== 'Escape') return;
    this.onGesture();
    if (event.code === 'Escape' || event.code === 'KeyP') { if (!event.repeat) this.onPause(); return; }
    if (event.code === 'KeyR') { if (!event.repeat) this.onReplay(); return; }
    if (this.active && ['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) event.preventDefault();
    if (!this.active) return;
    if (event.code === 'KeyC' && !event.repeat) this.onCamera();
    if (event.code === 'KeyM' && !event.repeat) this.onMute();
    if (event.code === 'KeyF' && !event.repeat) this.onFullscreen();
    if (!this.keys.has(event.code)) this.pressed.add(event.code);
    this.keys.add(event.code);
  };
  private keyUp = (event: KeyboardEvent) => {
    if (this.keys.has(event.code)) this.released.add(event.code);
    this.keys.delete(event.code);
  };
  clear = () => {
    this.keys.clear(); this.touchKeys.clear(); this.pressed.clear(); this.released.clear();
    this.touchMove.x = this.touchMove.z = 0;
    this.gamepadPrevious = [];
    this.secondaryGamepadPrevious=[];
    const knob = this.touchRoot?.querySelector<HTMLElement>('.touch-stick-knob');
    if (knob) knob.style.transform = 'translate(-50%, -50%)';
    this.touchRoot?.querySelectorAll('.held').forEach(button=>button.classList.remove('held'));
  };
  setLocale(locale:Locale){this.locale=locale;this.updateTouchLabels();}
  private updateTouchLabels(){
    const zh=this.locale==='zh',offense=this.touchOffense;
    const labels:Record<string,string>={screen:zh?'掩护':'SCREEN',sprint:zh?'冲刺':'SPRINT',skill:zh?(offense?'突破':'抢断'):(offense?'CROSS':'STEAL'),pass:zh?(offense?'传球':'切人'):(offense?'PASS':'SWITCH'),shoot:zh?(offense?'投篮':'封盖'):(offense?'SHOOT':'BLOCK')};
    this.touchRoot.querySelector('.touch-stick')?.setAttribute('aria-label',zh?'移动摇杆':'Movement joystick');
    for(const [key,label] of Object.entries(labels)){const button=this.touchRoot.querySelector<HTMLButtonElement>(`.touch-${key}`)!;button.textContent=label;button.setAttribute('aria-label',label);}
  }
  setActive(active: boolean) { this.active = active; this.touchRoot.classList.toggle('active',active); this.ignoreGamepadUntilRelease=this.ignoreSecondaryUntilRelease=true;if (!active) this.clear(); }
  setMultiplayer(enabled:boolean){this.multiplayer=enabled;this.clear();this.ignoreGamepadUntilRelease=this.ignoreSecondaryUntilRelease=true;}
  private controller(side:0|1){const pads=Array.from(navigator.getGamepads?.()??[]).filter((pad):pad is Gamepad=>!!pad?.connected);if(this.multiplayer&&pads.length===1)return side===1?pads[0]:undefined;return pads[side];}
  /** Poll system/menu controls even while the basketball simulation is paused. */
  pollSystem(){
    const pad=Array.from(navigator.getGamepads?.()??[]).find(p=>p?.connected);
    if(!pad){this.systemStartDown=this.menuConfirmDown=this.menuBackDown=this.replayButtonDown=false;return;}
    const start=Array.from(navigator.getGamepads?.()??[]).some(p=>!!p?.buttons[9]?.pressed),confirm=!!pad.buttons[0]?.pressed,back=!!pad.buttons[1]?.pressed;
    const startPressed=start&&!this.systemStartDown;this.systemStartDown=start;
    if(startPressed){this.onGesture();this.onPause();}
    const replay=!!pad.buttons[8]?.pressed;if(replay&&!this.replayButtonDown)this.onReplay();this.replayButtonDown=replay;
    if(!this.active){
      const overlay=document.querySelector<HTMLElement>('.save-backdrop:not([hidden])')??document.querySelector<HTMLElement>('.review-backdrop:not([hidden])')??document.querySelector<HTMLElement>('.ui-overlay');
      const targets=overlay?Array.from(overlay.querySelectorAll<HTMLElement>('button:not([disabled]),select:not([disabled]),input:not([disabled])')).filter(el=>el.getClientRects().length>0&&!el.closest('[inert]')):[];
      const focus=document.activeElement as HTMLElement|null;
      const y=(pad.buttons[13]?.pressed?1:0)-(pad.buttons[12]?.pressed?1:0)+(Math.abs(pad.axes[1]??0)>.6?Math.sign(pad.axes[1]):0);
      const x=(pad.buttons[15]?.pressed?1:0)-(pad.buttons[14]?.pressed?1:0)+(Math.abs(pad.axes[0]??0)>.6?Math.sign(pad.axes[0]):0);
      const now=performance.now();
      if((x||y)&&now>=this.nextMenuMove){
        this.nextMenuMove=now+230;
        if(x&&focus instanceof HTMLSelectElement){focus.selectedIndex=(focus.selectedIndex+Math.sign(x)+focus.options.length)%focus.options.length;focus.dispatchEvent(new Event('change',{bubbles:true}));}
        else if(x&&focus instanceof HTMLInputElement&&focus.type==='range'){focus.value=String(Math.max(Number(focus.min),Math.min(Number(focus.max),Number(focus.value)+Math.sign(x)*Number(focus.step||.05))));focus.dispatchEvent(new Event('input',{bubbles:true}));}
        else if(targets.length){const index=targets.indexOf(focus!);targets[(index+Math.sign(y||x)+targets.length)%targets.length].focus();}
      }else if(!x&&!y)this.nextMenuMove=0;
      if(confirm&&!this.menuConfirmDown){this.onGesture();if(focus instanceof HTMLButtonElement||focus instanceof HTMLInputElement)focus.click();else if(!targets.includes(focus!))targets[0]?.focus();}
      if(back&&!this.menuBackDown){(document.querySelector('.subpanel-backdrop')??window).dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape',bubbles:true}));}
    }
    this.menuConfirmDown=confirm;this.menuBackDown=back;
  }
  private setupTouch() {
    const stick = this.touchRoot.querySelector<HTMLElement>('.touch-stick')!;
    const knob = stick.firstElementChild as HTMLElement;
    let pointer: number | null = null;
    const move = (event: PointerEvent) => {
      const rect = stick.getBoundingClientRect(), radius = rect.width * .34;
      let x = event.clientX - rect.left - rect.width / 2, z = event.clientY - rect.top - rect.height / 2;
      const length = Math.hypot(x,z); if (length > radius) { x *= radius / length; z *= radius / length; }
      this.touchMove = {x:x/radius,z:z/radius};
      knob.style.transform = `translate(calc(-50% + ${x}px),calc(-50% + ${z}px))`;
    };
    stick.addEventListener('pointerdown', event => { if(pointer!==null)return;pointer = event.pointerId; stick.setPointerCapture(pointer); move(event); event.preventDefault(); });
    stick.addEventListener('pointermove', event => { if (pointer === event.pointerId) move(event); });
    const release = () => { pointer = null; this.touchMove = {x:0,z:0}; knob.style.transform = 'translate(-50%,-50%)'; };
    stick.addEventListener('pointerup', release); stick.addEventListener('pointercancel',release);stick.addEventListener('lostpointercapture',release);
    for (const button of this.touchRoot.querySelectorAll<HTMLButtonElement>('[data-key]')) {
      const key = button.dataset.key!;
      button.addEventListener('pointerdown', event => { button.setPointerCapture(event.pointerId); this.touchKeys.add(key); this.pressed.add(key); button.classList.add('held'); this.onGesture(); event.preventDefault(); });
      const up = () => { if (this.touchKeys.has(key)) this.released.add(key); this.touchKeys.delete(key); button.classList.remove('held'); };
      button.addEventListener('pointerup',up); button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);
    }
  }
  sample(offense: boolean): InputFrame {
    if (!this.active) return {...EMPTY_INPUT};
    if(offense!==this.touchOffense){this.touchOffense=offense;this.updateTouchLabels();}
    const down = (key: string) => this.keys.has(key) || this.touchKeys.has(key);
    let x = Number(down('KeyD') || (!this.multiplayer&&down('ArrowRight'))) - Number(down('KeyA') || (!this.multiplayer&&down('ArrowLeft'))) + this.touchMove.x;
    let z = Number(down('KeyS') || (!this.multiplayer&&down('ArrowDown'))) - Number(down('KeyW') || (!this.multiplayer&&down('ArrowUp'))) + this.touchMove.z;
    const pad = this.controller(0);
    let padDown: boolean[] = pad?.buttons.map(b=>b.pressed) ?? [];
    if(this.ignoreGamepadUntilRelease){if(padDown.some(Boolean))padDown=[];else this.ignoreGamepadUntilRelease=false;}
    const padPressed = (i:number) => !!padDown[i] && !this.gamepadPrevious[i];
    const padReleased = (i:number) => !padDown[i] && !!this.gamepadPrevious[i];
    if (pad) {
      x += Math.abs(pad.axes[0])>.16 ? pad.axes[0] : 0;
      z += Math.abs(pad.axes[1])>.16 ? pad.axes[1] : 0;
    }
    const length = Math.hypot(x,z); if (length>1) { x/=length; z/=length; }
    const shootPressed = this.pressed.has('Space') || padPressed(0);
    const passPressed = this.pressed.has('KeyJ') || padPressed(2);
    const skillPressed = this.pressed.has('KeyK') || padPressed(1);
    const frame:InputFrame = {
      moveX:x,moveZ:z,sprint:down('ShiftLeft')||(!this.multiplayer&&down('ShiftRight'))||!!padDown[7],
      shootHeld:offense&&(down('Space')||!!padDown[0]),
      shootPressed:offense&&shootPressed,
      shootReleased:offense&&(this.released.has('Space')||padReleased(0)),
      passPressed:offense&&passPressed,
      switchPressed:this.pressed.has('Tab')||padPressed(4)||(!offense&&passPressed),
      stealPressed:!offense&&skillPressed,
      blockPressed:!offense&&shootPressed,
      crossoverPressed:offense&&skillPressed,
      callScreenPressed:this.pressed.has('KeyL')||padPressed(3),
    };
    for (let i=1;i<=5;i++) if (offense&&this.pressed.has(`Digit${i}`)) {frame.passTarget=i-1;frame.passPressed=true;}
    this.gamepadPrevious=padDown;
    this.pressed.clear(); this.released.clear();
    return frame;
  }
  /** Sample before sample(), which clears shared keyboard edge events. */
  sampleSecondary(offense:boolean):InputFrame{
    if(!this.active||!this.multiplayer)return {...EMPTY_INPUT};
    const pad=this.controller(1);
    let buttons=pad?.buttons.map(button=>button.pressed)??[];
    if(this.ignoreSecondaryUntilRelease){if(buttons.some(Boolean))buttons=[];else this.ignoreSecondaryUntilRelease=false;}
    const pressed=(i:number)=>!!buttons[i]&&!this.secondaryGamepadPrevious[i];
    const released=(i:number)=>!buttons[i]&&!!this.secondaryGamepadPrevious[i];
    const down=(a:string,b?:string)=>this.keys.has(a)||!!b&&this.keys.has(b);
    const edge=(set:Set<string>,a:string,b?:string)=>set.has(a)||!!b&&set.has(b);
    let x=Number(down('ArrowRight'))-Number(down('ArrowLeft'))+(Math.abs(pad?.axes[0]??0)>.16?pad!.axes[0]:0);
    let z=Number(down('ArrowDown'))-Number(down('ArrowUp'))+(Math.abs(pad?.axes[1]??0)>.16?pad!.axes[1]:0);
    const length=Math.hypot(x,z);if(length>1){x/=length;z/=length;}
    const shoot=edge(this.pressed,'KeyU','Numpad1')||pressed(0),pass=edge(this.pressed,'KeyI','Numpad2')||pressed(2),skill=edge(this.pressed,'KeyO','Numpad3')||pressed(1);
    const frame:InputFrame={moveX:x,moveZ:z,sprint:down('ShiftRight')||!!buttons[7],shootHeld:offense&&(down('KeyU','Numpad1')||!!buttons[0]),shootPressed:offense&&shoot,shootReleased:offense&&(edge(this.released,'KeyU','Numpad1')||released(0)),passPressed:offense&&pass,switchPressed:edge(this.pressed,'KeyY','Numpad0')||pressed(4)||!offense&&pass,stealPressed:!offense&&skill,blockPressed:!offense&&shoot,crossoverPressed:offense&&skill,callScreenPressed:edge(this.pressed,'KeyH','Numpad5')||pressed(3)};
    this.secondaryGamepadPrevious=buttons;return frame;
  }
}
