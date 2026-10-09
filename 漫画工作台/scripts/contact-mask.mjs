import sharp from 'sharp';

// Protect the object except for the explicitly declared hand contact. Peer
// objects and the other hand remain protected even inside that aperture.
export async function contactMask({width,height,anchor,elbow,contacts=[],objectBounds,peerMarkup='',radius,stroke,bridgeRatio=.24}) {
  const bridge={x:anchor.x+(elbow.x-anchor.x)*bridgeRatio,y:anchor.y+(elbow.y-anchor.y)*bridgeRatio};
  const b=objectBounds,ix=Math.max(4,b.width*.14),iy=Math.max(4,b.height*.09);
  const circle=(p,r,color)=>`<circle cx="${p.x*width}" cy="${p.y*height}" r="${r}" fill="${color}"/>`;
  const others=contacts.filter(p=>p.hand!==anchor.hand);
  const aperture=Math.min(radius,...others.map(p=>Math.hypot((p.x-anchor.x)*width,(p.y-anchor.y)*height)*.4));
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black"/><path d="M ${bridge.x*width} ${bridge.y*height} L ${anchor.x*width} ${anchor.y*height}" stroke="white" stroke-width="${stroke}" stroke-linecap="round"/>${circle(anchor,radius,'white')}<rect x="${b.x+ix}" y="${b.y+iy}" width="${Math.max(1,b.width-ix*2)}" height="${Math.max(1,b.height-iy*2)}" fill="black"/>${circle(anchor,aperture,'white')}${others.map(p=>circle(p,radius,'black')).join('')}${peerMarkup}</svg>`;
  const png=await sharp(Buffer.from(svg)).png().toBuffer();
  const {data,info}=await sharp(png).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true});
  const x=Math.round(anchor.x*width),y=Math.round(anchor.y*height);
  const activePixels=data.reduce((n,v)=>n+(v>0?1:0),0);
  const contactPixel=x>=0&&x<info.width&&y>=0&&y<info.height?data[y*info.width+x]:0;
  return {anchor,mask:png.toString('base64'),activePixels,contactPixel,usable:activePixels>0&&contactPixel>0};
}

export function assertContactMasks(masks) {
  if(!masks.length||masks.some(m=>!m.usable))throw new Error('手部遮罩为空或声明接触点被保护区遮挡，未应用接触重绘');
}
