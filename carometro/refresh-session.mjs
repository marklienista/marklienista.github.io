/* Troca local somente após leitura válida. Nunca salva, mescla ou descarta sem autorização. */
import {validateSpace,hasYears,hasGroups,ALL,UNGROUPED} from './model.js?v=0.13';
import {copyDriveAccess} from './sync-status.mjs?v=0.16';
export async function refreshSession(S,{allowDiscard=false}={}){
  if(!S.isCloud()||!S.link)throw Error('Reconecte a mesma conta antes de atualizar os dados.');
  if(S.dirty&&!allowDiscard)throw Error('Há alterações locais pendentes. Nenhuma foi descartada.');
  const link=S.link,drive=S.drive,generation=S.generation,id=S.space.id,email=drive.email;
  const previous={year:S.year,classId:S.classId,selected:new Set(S.selected)};
  const candidate=copyDriveAccess(drive,S.config.clientId);let adopted=false;
  try{
    const result=await candidate.open(link.manifestId),state=validateSpace(result.state);
    if(S.link!==link||S.drive!==drive||S.space.id!==id||S.generation!==generation||!S.isCloud()||S.drive.email!==email){
      throw Error('O carômetro foi alterado durante a consulta. Nada foi descartado; tente atualizar novamente.');
    }
    if(state.id!==id)throw Error('O documento remoto não corresponde ao carômetro aberto.');
    if(S.dirty&&!allowDiscard)throw Error('Há alterações locais pendentes. Nenhuma foi descartada.');
    S.resetPhotos();drive.closeSpace();S.drive=candidate;adopted=true;
    S.space=state;S.link=result.link;S.active=true;S.stagingFolder=null;S.dirty=false;S.generation++;
    const years=state.classes.map(c=>c.year).filter(Number.isInteger);
    S.year=hasYears(state)?(years.includes(previous.year)?previous.year:years.length?Math.max(...years):null):null;
    S.classId=hasGroups(state)&&([ALL,UNGROUPED].includes(previous.classId)||state.classes.some(c=>c.id===previous.classId&&(!hasYears(state)||c.year===S.year)))?previous.classId:ALL;
    S.selected=new Set([...previous.selected].filter(id=>state.students.some(p=>p.id===id&&!p.archived)));
    S.onUpdate();return await S.loadPhotos();
  }finally{if(!adopted)candidate.disconnect()}
}
