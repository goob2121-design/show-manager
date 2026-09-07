import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminSessionCookieName, verifyAdminSessionCookieValue } from "@/lib/admin-session";

export const runtime = "nodejs";
type Context = { params: Promise<{ showId: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function client() { const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.SUPABASE_SERVICE_ROLE_KEY??process.env.SUPABASE_SERVICE_ROLE; if(!url||!key) throw new Error("Show Personnel is not configured."); return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}); }
export async function GET(request: Request, context: Context) {
 try { const {showId}=await context.params; const supabase=client(); const slug=new URL(request.url).searchParams.get("slug")?.trim()??"";
  if(!uuid.test(showId)||!slug) return NextResponse.json({error:"Valid show ID and slug are required."},{status:400});
  const {data:current,error:currentError}=await supabase.from("shows").select("id,slug,show_date").eq("id",showId).eq("slug",slug).maybeSingle();
  if(currentError) throw currentError; const store=await cookies();
  if(!current||!verifyAdminSessionCookieValue(slug,store.get(getAdminSessionCookieName(slug))?.value)) return NextResponse.json({error:"Admin access is required."},{status:401});
  if(!current.show_date) return NextResponse.json({previous:null});
  const {data:shows,error:showsError}=await supabase.from("shows").select("id,name,show_date").lt("show_date",current.show_date).not("show_date","is",null).order("show_date",{ascending:false});
  if(showsError) throw showsError;
  for(const show of shows??[]) { const {data:rows,error}=await supabase.from("show_payout_items").select("amount").eq("show_id",show.id).eq("entry_kind","personnel"); if(error) throw error; if(rows?.length) return NextResponse.json({previous:{id:show.id,name:show.name,showDate:show.show_date,personnelCount:rows.length,totalPersonnelPay:rows.reduce((sum,row)=>sum+Number(row.amount||0),0)}}); }
  return NextResponse.json({previous:null});
 } catch(error) { console.error("Previous personnel preview failed.",error); return NextResponse.json({error:"Unable to load previous personnel preview."},{status:500}); }
}

export async function POST(request: Request, context: Context) {
 try { const {showId}=await context.params; const supabase=client(); const slug=new URL(request.url).searchParams.get("slug")?.trim()??"";
  if(!uuid.test(showId)||!slug) return NextResponse.json({error:"Valid show ID and slug are required."},{status:400});
  const {data:current}=await supabase.from("shows").select("id,slug,show_date").eq("id",showId).eq("slug",slug).maybeSingle(); const store=await cookies();
  if(!current||!verifyAdminSessionCookieValue(slug,store.get(getAdminSessionCookieName(slug))?.value)) return NextResponse.json({error:"Admin access is required."},{status:401});
  if(!current.show_date) return NextResponse.json({added:0,skipped:0,recurringSkipped:0,customSkipped:0});
  const {data:shows,error:showError}=await supabase.from("shows").select("id,show_date").lt("show_date",current.show_date).not("show_date","is",null).order("show_date",{ascending:false}); if(showError) throw showError;
  let source:any[]=[]; for(const show of shows??[]){const {data,error}=await supabase.from("show_payout_items").select("*").eq("show_id",show.id).eq("entry_kind","personnel");if(error)throw error;if(data?.length){source=data;break;}}
  if(!source.length)return NextResponse.json({added:0,skipped:0,recurringSkipped:0,customSkipped:0});
  const {data:existing,error:existingError}=await supabase.from("show_payout_items").select("personnel_profile_id").eq("show_id",showId).eq("entry_kind","personnel");if(existingError)throw existingError;
  const assigned=new Set((existing??[]).map(row=>row.personnel_profile_id).filter(Boolean)); const recurring=source.filter(row=>row.personnel_profile_id); const missing=recurring.filter(row=>!assigned.has(row.personnel_profile_id)); const customSkipped=source.length-recurring.length;
  if(!missing.length)return NextResponse.json({added:0,skipped:source.length,recurringSkipped:recurring.length,customSkipped});
  const {data,error}=await supabase.from("show_payout_items").insert(missing.map(row=>({show_id:showId,entry_kind:"personnel",personnel_profile_id:row.personnel_profile_id,guest_profile_id:null,payee_name:row.payee_name,role_snapshot:row.role_snapshot,amount:row.amount,category:row.category,description:row.description,display_order:row.display_order,paid:false,paid_at:null,payment_method:null,payment_note:null,updated_at:new Date().toISOString()}))).select("id");
  if(error?.code==="23505")return NextResponse.json({added:0,skipped:source.length,recurringSkipped:recurring.length,customSkipped}); if(error)throw error;
  return NextResponse.json({added:data?.length??0,skipped:source.length-(data?.length??0),recurringSkipped:recurring.length-(data?.length??0),customSkipped});
 }catch(error){console.error("Previous personnel copy failed.",error);return NextResponse.json({error:"Unable to copy previous personnel."},{status:500});}
}