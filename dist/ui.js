// Keep native values/change events for game settings, but never open a native picker.
let current=null;
export function closeDropdown(restoreFocus=false){if(!current)return;const {trigger,list}=current;current=null;trigger.setAttribute('aria-expanded','false');list.remove();if(restoreFocus&&trigger.isConnected)trigger.focus()}
export function enhanceSelects(root=document){for(const select of root.querySelectorAll('select:not([data-custom])')){
 select.dataset.custom='true';select.hidden=true;select.tabIndex=-1;
 const wrap=document.createElement('div');wrap.className='custom-select';select.before(wrap);wrap.append(select);
 const trigger=document.createElement('button');trigger.type='button';trigger.className='select-trigger';trigger.id=select.id+'Trigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',select.id+'List');
 const label=select.getAttribute('aria-labelledby');if(label)trigger.setAttribute('aria-labelledby',label+' '+trigger.id);else trigger.setAttribute('aria-label',select.parentElement.parentElement.firstChild.textContent.trim());
 wrap.append(trigger);const sync=()=>{trigger.textContent=select.selectedOptions[0]?.textContent||'';trigger.disabled=select.disabled};sync();select.addEventListener('change',sync);
 const open=()=>{if(current?.trigger===trigger){closeDropdown();return}closeDropdown();const list=document.createElement('div');list.id=select.id+'List';list.className='select-options';list.setAttribute('role','listbox');list.setAttribute('aria-labelledby',trigger.id);document.body.append(list);
 const options=[...select.options];const buttons=options.map((option,i)=>{const b=document.createElement('button');b.type='button';b.textContent=option.textContent;b.id=select.id+'Option'+i;b.setAttribute('role','option');b.setAttribute('aria-selected',option.selected);b.disabled=option.disabled;b.tabIndex=-1;b.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));closeDropdown(true)};list.append(b);return b});
 const r=trigger.getBoundingClientRect(),margin=10,v=window.visualViewport,viewTop=v?.offsetTop||0,viewLeft=v?.offsetLeft||0,viewWidth=v?.width||innerWidth,viewHeight=v?.height||innerHeight,bottom=viewTop+viewHeight-margin,below=bottom-r.bottom-4,above=r.top-viewTop-margin-4,w=Math.min(Math.max(r.width,230),viewWidth-margin*2);list.style.width=w+'px';list.style.left=Math.max(viewLeft+margin,Math.min(r.left,viewLeft+viewWidth-w-margin))+'px';const up=below<Math.min(list.scrollHeight,190)&&above>below;list.style.maxHeight=Math.max(0,Math.min(260,up?above:below))+'px';list.style.top=(up?Math.max(viewTop+margin,r.top-list.offsetHeight-4):r.bottom+4)+'px';
 trigger.setAttribute('aria-expanded','true');current={trigger,list};const selected=buttons[select.selectedIndex]||buttons[0];selected?.focus({preventScroll:true});selected?.scrollIntoView({block:'nearest'});
 list.onkeydown=e=>{const enabled=buttons.filter(b=>!b.disabled),i=enabled.indexOf(document.activeElement);let next;if(e.key==='ArrowDown')next=(i+1)%enabled.length;if(e.key==='ArrowUp')next=(i-1+enabled.length)%enabled.length;if(e.key==='Home')next=0;if(e.key==='End')next=enabled.length-1;if(next!==undefined){e.preventDefault();enabled[next]?.focus()}if(e.key==='Tab')closeDropdown(true)};
 };
 trigger.onclick=e=>{e.preventDefault();open()};trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();open()}};
}}
document.addEventListener('pointerdown',e=>{if(current&&!current.list.contains(e.target)&&!current.trigger.contains(e.target))closeDropdown()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&current){e.preventDefault();e.stopImmediatePropagation();closeDropdown(true)}},true);
document.addEventListener('scroll',e=>{if(current&&!current.list.contains(e.target))closeDropdown()},true);
addEventListener('resize',()=>closeDropdown());window.visualViewport?.addEventListener('resize',()=>closeDropdown());
