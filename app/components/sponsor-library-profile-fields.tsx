import type { ChangeEvent } from "react";
import type { SponsorLibraryFormState } from "@/lib/types";
import { SPONSOR_CONTACT_METHODS } from "@/lib/sponsor-library";

type Props = {
  value: SponsorLibraryFormState;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  sponsorTypeOptions: readonly string[];
};

const inputClass = "min-h-11 rounded-xl border border-slate-600 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 hover:border-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20";
const labelClass = "flex flex-col gap-2 text-sm font-semibold text-slate-200";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const headingId = `sponsor-section-${title.toLowerCase().replaceAll(" ", "-")}`;

  return <fieldset aria-labelledby={headingId} className="grid gap-5 rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-[0_1px_0_rgba(255,255,255,0.03)] sm:p-5">
    <h3 id={headingId} className="border-b border-slate-700/80 pb-3 text-sm font-bold uppercase tracking-[0.14em] text-cyan-300">{title}</h3>
    {children}
  </fieldset>;
}

export function SponsorLibraryProfileFields({ value, onChange, sponsorTypeOptions }: Props) {
  return <>
    <Section title="Sponsor Identity"><div className="grid gap-4 sm:grid-cols-2">
      <label className={labelClass}>Sponsor Name<input required name="name" value={value.name} onChange={onChange} className={inputClass} placeholder="Business or organization name" /></label>
      <label className={labelClass}>Legal Name<input name="legalName" value={value.legalName} onChange={onChange} className={inputClass} /></label>
      <label className={labelClass}>Recognition Name<input name="recognitionName" value={value.recognitionName} onChange={onChange} className={inputClass} placeholder="Public name; defaults to Sponsor Name" /></label>
      <label className={labelClass}>Sponsorship Level<input name="sponsorshipLevel" value={value.sponsorshipLevel} onChange={onChange} className={inputClass} /></label>
      <label className={labelClass}>Sponsor Since<input type="number" min="1900" max="2200" name="sponsorSinceYear" value={value.sponsorSinceYear} onChange={onChange} className={inputClass} placeholder="Year" /></label>
      <label className={labelClass}>Sponsor Type<select name="sponsorType" value={value.sponsorType} onChange={onChange} className={inputClass}><option value="">Optional</option>{sponsorTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
    </div></Section>

    <Section title="Primary Contact"><div className="grid gap-4 sm:grid-cols-2">
      <label className={labelClass}>Contact Person<input name="contactPerson" value={value.contactPerson} onChange={onChange} className={inputClass} /></label>
      <label className={labelClass}>Contact Title<input name="contactTitle" value={value.contactTitle} onChange={onChange} className={inputClass} /></label>
      <label className={labelClass}>Email<input type="email" name="email" value={value.email} onChange={onChange} className={inputClass} /></label>
      <label className={labelClass}>Phone<input type="tel" name="phone" value={value.phone} onChange={onChange} className={inputClass} /></label>
      <label className={labelClass}>Mobile Phone<input type="tel" name="mobilePhone" value={value.mobilePhone} onChange={onChange} className={inputClass} /></label>
      <label className={labelClass}>Preferred Contact Method<select name="preferredContactMethod" value={value.preferredContactMethod} onChange={onChange} className={inputClass}>{SPONSOR_CONTACT_METHODS.map((method) => <option key={method} value={method}>{method === "none" ? "None" : method[0].toUpperCase() + method.slice(1)}</option>)}</select></label>
    </div><label className={labelClass}>Preferred Contact Notes<textarea name="preferredContactNotes" value={value.preferredContactNotes} onChange={onChange} className={`${inputClass} min-h-20`} /></label></Section>

    <Section title="Address"><div className="grid gap-4 sm:grid-cols-2">
      <label className={`${labelClass} sm:col-span-2`}>Address Line 1<input name="addressLine1" value={value.addressLine1} onChange={onChange} className={inputClass} /></label>
      <label className={`${labelClass} sm:col-span-2`}>Address Line 2<input name="addressLine2" value={value.addressLine2} onChange={onChange} className={inputClass} /></label>
      <label className={labelClass}>City<input name="city" value={value.city} onChange={onChange} className={inputClass} /></label>
      <label className={labelClass}>State<input name="state" value={value.state} onChange={onChange} className={inputClass} /></label>
      <label className={labelClass}>ZIP / Postal Code<input name="postalCode" value={value.postalCode} onChange={onChange} className={inputClass} /></label>
    </div></Section>

    <Section title="Online Presence"><div className="grid gap-4 sm:grid-cols-2">
      <label className={labelClass}>Website<input type="url" name="website" value={value.website} onChange={onChange} className={inputClass} placeholder="https://example.com" /></label>
      <label className={labelClass}>Facebook<input type="url" name="facebookUrl" value={value.facebookUrl} onChange={onChange} className={inputClass} /></label>
      <label className={labelClass}>Instagram<input type="url" name="instagramUrl" value={value.instagramUrl} onChange={onChange} className={inputClass} /></label>
    </div></Section>

    <Section title="Sponsorship Details"><div className="grid gap-4 sm:grid-cols-2">
      <label className={labelClass}>Standard Sponsorship Amount<input inputMode="decimal" name="standardSponsorshipAmount" value={value.standardSponsorshipAmount} onChange={onChange} className={inputClass} /></label>
      <label className={labelClass}>Estimated Value<input inputMode="decimal" name="estimatedValue" value={value.estimatedValue} onChange={onChange} className={inputClass} /></label>
      <label className={labelClass}>Renewal Date<input type="date" name="renewalDate" value={value.renewalDate} onChange={onChange} className={inputClass} /></label>
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-200"><input type="checkbox" name="isInKind" checked={value.isInKind} onChange={onChange} className="h-4 w-4 accent-cyan-500" />In-Kind Sponsor</label>
    </div>{value.isInKind ? <label className={labelClass}>In-Kind Description<textarea name="inKindDescription" value={value.inKindDescription} onChange={onChange} className={`${inputClass} min-h-20`} /></label> : null}<label className={labelClass}>Default Contribution<textarea name="defaultContribution" value={value.defaultContribution} onChange={onChange} className={`${inputClass} min-h-20`} /></label></Section>

    <Section title="Notes"><label className={labelClass}>Short Message<textarea name="shortMessage" value={value.shortMessage} onChange={onChange} className={`${inputClass} min-h-20`} /></label><label className={labelClass}>Full Message<textarea name="fullMessage" value={value.fullMessage} onChange={onChange} className={`${inputClass} min-h-24`} /></label><label className={labelClass}>Recognition Notes<textarea name="recognitionNotes" value={value.recognitionNotes} onChange={onChange} className={`${inputClass} min-h-20`} /></label><label className={labelClass}>General Notes<textarea name="notes" value={value.notes} onChange={onChange} className={`${inputClass} min-h-24`} /></label><label className={labelClass}>Last Contacted<input type="datetime-local" name="lastContactedAt" value={value.lastContactedAt} onChange={onChange} className={inputClass} /></label></Section>
  </>;
}
