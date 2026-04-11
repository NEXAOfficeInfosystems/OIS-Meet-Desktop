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

  private isSidebarCollapsedSource = new BehaviorSubject<boolean>(false);
  isSidebarCollapsed$ = this.isSidebarCollapsedSource.asObservable();

  toggleSidebar() {
    this.isSidebarCollapsedSource.next(!this.isSidebarCollapsedSource.value);
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
      '#E3F2FD', // Light Blue
      '#F3E5F5', // Light Purple
      '#E8F5E9', // Light Green
      '#FFF3E0', // Light Orange
      '#FCE4EC', // Light Pink
      '#E0F2F1', // Light Teal
      '#F9FBE7', // Light Lime
      '#FFFDE7'  // Light Yellow
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

  getInitials(name: string | null | undefined): string {
    if (!name) return 'U';
    const trimmed = name.trim();
    if (!trimmed) return 'U';

    const parts = trimmed.split(/\s+/);
    if (parts.length > 1) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    } else {
      return trimmed.substring(0, 2).toUpperCase();
    }
  }
}
