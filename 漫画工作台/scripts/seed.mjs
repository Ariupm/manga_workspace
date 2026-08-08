import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = path.join(process.cwd(),"data");
fs.mkdirSync(dataDir,{recursive:true});
const db = new DatabaseSync(path.join(dataDir,"studio.db"));
const count = db.prepare("SELECT COUNT(*) c FROM projects").get().c;
if (count) { console.log("示例数据已存在"); process.exit(0); }

db.exec("BEGIN");
try {
  db.prepare("INSERT INTO projects(id,title) VALUES(1,?)").run("小粉求职记");
  db.prepare("INSERT INTO episodes(id,project_id,title,kind,synopsis) VALUES(1,1,?,?,?)").run("第五章 · 求职日常","long","小粉在新家展开规律又略显焦虑的求职日常，从清晨醒来到夜晚入睡。");
  db.prepare("INSERT INTO pages(id,episode_id,number,title,layout) VALUES(1,1,6,?,?)").run("求职 · 循环","five");
  const shots = [
    ["吃包子","坐在餐桌前手持包子吃早餐，清晨室内柔光。","先吃饱，今天一定会有好消息。","中景","餐厅","清晨"],
    ["上午刷招聘","坐在桌边查看手机招聘应用，神情期待。","","近景","客厅","上午"],
    ["准备午餐","厨房切菜，动作自然，手部清晰。","","中景","厨房","中午"],
    ["独自午餐","碗筷与手机支架入画，一个人的安静日常。","","全景","餐厅","中午"],
    ["午睡","伏在桌面休息，午后阳光从窗边照入。","","远景","客厅","午后"]
  ];
  const insertShot = db.prepare("INSERT INTO shots(page_id,position,title,description,dialogue,camera,character_ids,scene,time_of_day,outfit_id,shoe_id,status) VALUES(1,?,?,?,?,?,? ,?,?,?,?,?)");
  const sourceImages = ["../小粉的美好早晨.png","../小粉的美好早晨-第二页.png","../小粉的美好早晨-第3页.png","../小粉的美好早晨-第4页.png","../小粉的美好早晨-第5页.png"];
  shots.forEach((s,index) => {
    const result = insertShot.run(index+1,s[0],s[1],s[2],s[3],JSON.stringify(["character_xiaofen"]),s[4],s[5],"XF-SLEEP-02","XF-SHOE-02","draft");
    const id = Number(result.lastInsertRowid);
    db.prepare("INSERT INTO candidates(shot_id,image_path,label,version,selected) VALUES(?,?,?,?,1)").run(id,sourceImages[index],"参考候选",1);
    db.prepare("INSERT INTO candidates(shot_id,image_path,label,version,selected) VALUES(?,?,?,?,0)").run(id,sourceImages[(index+1)%sourceImages.length],"备选构图",2);
  });
  const assets = [
    ["character_xiaofen","character","小粉标准形象","../角色资产/小粉/01-标准三视图.png",["成年女性","粉色长发","暖粉棕眼睛"]],
    ["XF-SLEEP-02","outfit","兔子短袖七分裤睡衣","../角色资产/小粉/夏季衣橱/01-夏季睡衣-2套.png",["夏季","居家","睡衣"]],
    ["XF-WORK-01","outfit","粉色长裙经典通勤装","../角色资产/小粉/夏季衣橱/02-夏季工作装-4套.png",["夏季","工作"]],
    ["XF-CASUAL-01","outfit","奶黄上衣粉色半身裙","../角色资产/小粉/夏季衣橱/03-夏季休闲装-3套.png",["夏季","休闲"]],
    ["XF-SHOE-02","shoes","粉色交叉居家拖鞋","../角色资产/小粉/夏季衣橱/04-夏季鞋履-12双.png",["居家","拖鞋"]]
  ];
  assets.forEach(a => db.prepare("INSERT INTO assets(id,type,name,path,tags) VALUES(?,?,?,?,?)").run(a[0],a[1],a[2],a[3],JSON.stringify(a[4])));
  [["清晨起床","清晨"],["早餐与求职","上午"],["午餐","中午"],["短暂休息","午后"]].forEach((t,i) => db.prepare("INSERT INTO timeline(episode_id,sequence,label,time_of_day,outfit_id,shoe_id,note) VALUES(1,?,?,?,?,?,?)").run(i+1,t[0],t[1],"XF-SLEEP-02","XF-SHOE-02","同一天居家造型保持一致"));
  db.exec("COMMIT");
  console.log("示例项目已创建");
} catch (error) { db.exec("ROLLBACK"); throw error; }
