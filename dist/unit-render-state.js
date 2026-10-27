const isAttackAction=action=>action==='attack'||action==='airAttack';

// Attack scripts can outlive their active control. Keep their last pose only on
// an attacking layer, never as an override of walking or other actions.
export function unitRenderTracks(unit,bodyAction){
 const bodyTrackOverride=isAttackAction(bodyAction)?unit.attackVisualTrack||null:null;
 const requestedTurretAction=unit.turretAction||unit.action;
 // A turret can finish firing while its body is already chasing another goal.
 // Preserve its attack through the current shot/cooldown, then use idle again.
 const turretAttackRelevant=!!unit.attackControl?.active||unit.cooldown>0||isAttackAction(unit.action)&&!!unit.target?.alive;
 const turretAction=isAttackAction(requestedTurretAction)&&!turretAttackRelevant?'idle':requestedTurretAction;
 const turretTrackOverride=isAttackAction(turretAction)?unit.turretVisualTrack||null:null;
 return{bodyTrackOverride,turretAction,turretTrackOverride};
}
