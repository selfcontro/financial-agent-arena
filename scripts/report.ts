import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {generateReport,verifyReport} from '../src/services/report.js';
import {createSeedDataset} from '../src/data/seed.js';
const args=process.argv.slice(2);
if(args[0]==='--verify'){
  if(!args[1])throw new Error('用法：npm run report -- --verify reports/report.json');
  const report=await verifyReport(JSON.parse(await readFile(args[1],'utf8')));
  console.log(`报告复算一致：${report.dataset_hash}`);
}else{
  const data=args[0]?JSON.parse(await readFile(args[0],'utf8')):createSeedDataset();
  const output=resolve(args[1]??'reports');
  const report=await generateReport(data);
  await mkdir(output,{recursive:true});
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(resolve(output,'report.md'),report.markdown);
  console.log(`报告已生成：${output}；有效完成 ${report.summary.total_completed}/${report.summary.total_expected}`);
}
