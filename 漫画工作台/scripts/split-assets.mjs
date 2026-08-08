import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root=path.resolve(process.cwd(),"..","角色资产","小粉");
const catalogPath=path.join(root,"asset-catalog.json");
const outputRoot=path.join(process.cwd(),"workspace","assets","xiaofen");
fs.mkdirSync(outputRoot,{recursive:true});

const catalog=JSON.parse(fs.readFileSync(catalogPath,"utf8"));
const outfits=Object.values(catalog.wardrobe).flat();
const groups=new Map();
for(const item of outfits) {
  const group=groups.get(item.source)??[];
  group.push(item);groups.set(item.source,group);
}

async function cropGrid(source,items,columns,rows,inset=6) {
  const input=path.join(root,source);
  const meta=await sharp(input).metadata();
  if(!meta.width||!meta.height) throw new Error(`Cannot read ${input}`);
  for(const item of items) {
    const index=item.position-1;
    const column=index%columns,row=Math.floor(index/columns);
    const left=Math.floor(column*meta.width/columns)+(column>0?inset:0);
    const top=Math.floor(row*meta.height/rows)+(row>0?inset:0);
    const right=Math.floor((column+1)*meta.width/columns)-(column<columns-1?inset:0);
    const bottom=Math.floor((row+1)*meta.height/rows)-(row<rows-1?inset:0);
    const output=path.join(outputRoot,`${item.id}.png`);
    await sharp(input).extract({left,top,width:right-left,height:bottom-top}).png().toFile(output);
    console.log(`${item.id}: ${left},${top} ${right-left}x${bottom-top}`);
  }
}

for(const [source,items] of groups) await cropGrid(source,items,items.length,1,10);
await cropGrid(catalog.footwear[0].source,catalog.footwear,4,3,8);
console.log(`Created ${outfits.length+catalog.footwear.length} independent assets in ${outputRoot}`);
