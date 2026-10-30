/**
 * Pure ephemeral proposal lifecycle. A return from a pending AI call is
 * permitted to show UI ONLY if its ticket is the current active generation.
 * Switching studios / project, editing, or rejecting invalidates older tickets.
 */
export function createVideoProposalEpoch() {
  let serial=0;
  let active=false;
  function begin() {
    serial++;
    active=true;
    return serial;
  }
  function invalidate() {
    serial++;
    active=false;
  }
  function isCurrent(ticket) {
    return Number.isSafeInteger(ticket) && active && serial===ticket;
  }
  return Object.freeze({begin,invalidate,isCurrent});
}
