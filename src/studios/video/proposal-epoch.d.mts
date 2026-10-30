export type VideoProposalEpoch={
  begin():number;
  invalidate():void;
  isCurrent(ticket:number):boolean;
};
export declare function createVideoProposalEpoch():VideoProposalEpoch;
