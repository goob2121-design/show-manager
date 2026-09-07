import assert from "node:assert/strict";
import test from "node:test";
import { copyablePersonnel, previousShowPersonnelPreview, yearlyPersonnelTotals } from "./personnel-phase3.ts";
test("previous show is nearest date and copied personnel reset settlement", () => {
 assert.equal(previousShowPersonnelPreview([{id:"a",show_date:"2026-01-01"},{id:"b",show_date:"2026-03-01"}],"2026-04-01")?.id,"b");
 const [item]=copyablePersonnel([{id:"x",personnel_profile_id:null,guest_profile_id:"old",payee_name:"Guest",role_snapshot:"Fiddle",amount:100,paid:true,paid_at:"x",payment_method:"Cash",payment_note:"old"}],new Set(),new Set());
 assert.deepEqual([item.guest_profile_id,item.paid,item.paid_at,item.payment_method,item.payment_note],[null,false,null,null,null]);
});
test("year totals preserve committed cost while separating paid",()=>assert.deepEqual(yearlyPersonnelTotals([{amount:100,paid:true},{amount:50,paid:false}]),{committed:150,paid:100,remaining:50}));
