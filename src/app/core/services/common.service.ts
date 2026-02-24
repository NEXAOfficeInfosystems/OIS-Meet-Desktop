import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { CompanyUrlItem, CompanyUrlResponse, StoredDefaultCompany } from '../models/session.models';

@Injectable({
  providedIn: 'root'
})
export class CommonService {

  constructor() { }

  private companyListSource = new BehaviorSubject<any[]>([]);
  companyList$ = this.companyListSource.asObservable();

  setCompanies(companies: any) {
    this.companyListSource.next(companies);
  }
  private companyChangedSource = new Subject<any>();
  companyChanged$ = this.companyChangedSource.asObservable();

  notifyCompanyChanged(company: any) {
    this.companyChangedSource.next(company);
  }

  // In common.service.ts
private syncCompleteSource = new Subject<any>();
syncComplete$ = this.syncCompleteSource.asObservable();

notifySyncComplete(company: any) {
  this.syncCompleteSource.next(company);
}

  getCompanies() {
    return this.companyListSource.value;
  }

  pickDefaultCompanyForStorage(companyUrlResponse: CompanyUrlResponse): StoredDefaultCompany | null {
      const items = companyUrlResponse?.data;
      if (!Array.isArray(items) || items.length === 0) return null;

      const preferred = items.find((x: CompanyUrlItem) => x?.isDefault === true)
        ?? items.find((x: CompanyUrlItem) => x?.company?.isDefault === true)
        ?? items[0];

      const company = preferred?.company;
      if (!company) return null;

      return {
        clientId: company?.clientId,
        companyId: company?.companyId,
        companyname: company?.name,
        companylogo: company?.logo ?? null,
      };
  }

  getRandomColor(): string {
    const colors = [
      '#1a73e8',
      '#e91e63',
      '#4caf50',
      '#ff9800',
      '#9c27b0',
      '#009688'
    ];

    return colors[Math.floor(Math.random() * colors.length)];
  }
private selectedCompanySource = new BehaviorSubject<any>(null);
selectedCompany$ = this.selectedCompanySource.asObservable();

setSelectedCompany(company: any) {
  this.selectedCompanySource.next(company);
}

getSelectedCompany() {
  return this.selectedCompanySource.value;
}
}
