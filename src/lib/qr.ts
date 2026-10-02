/** Small, original QR encoder: byte mode, version 10, level L, mask 0.
 * Fixed-version output avoids a dependency and sends no room link to a third party.
 * Capacity: 271 UTF-8 bytes. Validated against Python qrcode's version-10/L/mask-0 matrix.
 */
export function qrMatrix(text:string):boolean[][] {
 const bytes=new TextEncoder().encode(text);if(bytes.length>271)throw new Error('The join URL is too long for this QR code. Use the displayed link.');
 const bits:number[]=[];const append=(v:number,n:number)=>{for(let i=n-1;i>=0;i--)bits.push((v>>>i)&1);};
 append(4,4);append(bytes.length,16);bytes.forEach(b=>append(b,8));append(0,Math.min(4,2192-bits.length));while(bits.length%8)bits.push(0);
 const data:number[]=[];for(let i=0;i<bits.length;i+=8)data.push(bits.slice(i,i+8).reduce((s,b)=>(s<<1)|b,0));for(let p=0;data.length<274;p++)data.push(p%2?0x11:0xec);
 const mul=(a:number,b:number)=>{let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11d);z^=((b>>>i)&1)*a;}return z;};
 let gen=[1],root=1;for(let i=0;i<18;i++){const g=Array(gen.length+1).fill(0);gen.forEach((x,j)=>{g[j]^=x;g[j+1]^=mul(x,root);});gen=g;root=mul(root,2);}
 const blocks:number[][]=[],checks:number[][]=[];let pos=0;for(const len of [68,68,69,69]){const b=data.slice(pos,pos+len);pos+=len;blocks.push(b);const rem=Array(18).fill(0);for(const v of b){const factor=v^rem.shift()!;rem.push(0);for(let j=0;j<18;j++)rem[j]^=mul(gen[j+1],factor);}checks.push(rem);}
 const words:number[]=[];for(let i=0;i<69;i++)for(const b of blocks)if(i<b.length)words.push(b[i]);for(let i=0;i<18;i++)for(const b of checks)words.push(b[i]);
 const n=57,grid=Array.from({length:n},()=>Array<boolean>(n).fill(false)),reserved=Array.from({length:n},()=>Array<boolean>(n).fill(false));const set=(x:number,y:number,value:boolean)=>{if(x>=0&&y>=0&&x<n&&y<n){grid[y][x]=value;reserved[y][x]=true;}};
 for(let i=0;i<n;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
 for(const [cx,cy] of [[3,3],[n-4,3],[3,n-4]])for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const dist=Math.max(Math.abs(dx),Math.abs(dy));set(cx+dx,cy+dy,dist!==2&&dist!==4);}
 for(let i=0;i<3;i++)for(let j=0;j<3;j++){if((i===0&&j===0)||(i===0&&j===2)||(i===2&&j===0))continue;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set([6,28,50][i]+dx,[6,28,50][j]+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);}
 let rem=8;for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);const format=((8<<10)|rem)^0x5412,bit=(i:number)=>((format>>>i)&1)!==0;
 for(let i=0;i<=5;i++)set(8,i,bit(i));set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));for(let i=9;i<15;i++)set(14-i,8,bit(i));
 for(let i=0;i<8;i++)set(n-1-i,8,bit(i));for(let i=8;i<15;i++)set(8,n-15+i,bit(i));set(8,n-8,true);
 rem=10;for(let i=0;i<12;i++)rem=(rem<<1)^((rem>>>11)*0x1f25);const version=(10<<12)|rem;for(let i=0;i<18;i++){const value=((version>>>i)&1)!==0,a=n-11+i%3,b=Math.floor(i/3);set(a,b,value);set(b,a,value);}
 let index=0;for(let right=n-1;right>=1;right-=2){if(right===6)right=5;for(let vert=0;vert<n;vert++){const y=((right+1)&2)===0?n-1-vert:vert;for(let j=0;j<2;j++){const x=right-j;if(!reserved[y][x]){const v=index<words.length*8?((words[index>>>3]>>>(7-(index&7)))&1)!==0:false;grid[y][x]=v!==((x+y)%2===0);index++;}}}}
 return grid;
}
export function drawQR(canvas:HTMLCanvasElement,text:string){const grid=qrMatrix(text),scale=6,border=4;canvas.width=canvas.height=(grid.length+border*2)*scale;const c=canvas.getContext('2d')!;c.fillStyle='#ffffff';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#000000';grid.forEach((row,y)=>row.forEach((value,x)=>{if(value)c.fillRect((x+border)*scale,(y+border)*scale,scale,scale);}));}
