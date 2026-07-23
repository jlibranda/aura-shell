"use client";

import { useState } from "react";
import {
  ChevronDown,
  Pencil,
  ArrowUpCircle,
  ArrowLeftRight,
  Banknote,
  BadgeCheck,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, MenuItem, MenuLabel } from "@/components/ui/overlay";
import { Separator } from "@/components/ui/primitives";
import { EditProfileDrawer } from "@/components/people/actions/edit-profile-drawer";
import { PromoteDrawer } from "@/components/people/actions/promote-drawer";
import { TransferDrawer } from "@/components/people/actions/transfer-drawer";
import { SalaryChangeDrawer } from "@/components/people/actions/salary-change-drawer";
import { RegularizeDrawer } from "@/components/people/actions/regularize-drawer";
import { ChangeManagerDrawer } from "@/components/people/actions/change-manager-drawer";
import type { Employee } from "@/lib/people/people-types";

type ActiveDrawer =
  | "edit"
  | "promote"
  | "transfer"
  | "salary_change"
  | "regularize"
  | "change_manager"
  | null;

/**
 * Profile-level Actions menu. Sprint 3.2 lifecycle actions plus the Sprint
 * 3.2.1 Edit Profile action. Regularize appears only for probationary staff.
 */
export function EmployeeActionsMenu({ employee }: { employee: Employee }) {
  const [active, setActive] = useState<ActiveDrawer>(null);
  const close = () => setActive(null);

  const canRegularize = employee.status === "probationary";

  return (
    <>
      <DropdownMenu
        width="w-56"
        trigger={({ open, toggle }) => (
          <Button variant="primary" size="sm" onClick={toggle} aria-expanded={open}>
            Actions
            <ChevronDown className="h-4 w-4" />
          </Button>
        )}
      >
        {(closeMenu) => (
          <>
            <MenuLabel>Profile</MenuLabel>
            <MenuItem
              icon={Pencil}
              onClick={() => {
                closeMenu();
                setActive("edit");
              }}
            >
              Edit profile
            </MenuItem>
            <Separator className="my-1" />
            <MenuLabel>Lifecycle actions</MenuLabel>
            <MenuItem
              icon={ArrowUpCircle}
              onClick={() => {
                closeMenu();
                setActive("promote");
              }}
            >
              Promote
            </MenuItem>
            <MenuItem
              icon={ArrowLeftRight}
              onClick={() => {
                closeMenu();
                setActive("transfer");
              }}
            >
              Transfer
            </MenuItem>
            <MenuItem
              icon={Banknote}
              onClick={() => {
                closeMenu();
                setActive("salary_change");
              }}
            >
              Salary change
            </MenuItem>
            {canRegularize ? (
              <MenuItem
                icon={BadgeCheck}
                onClick={() => {
                  closeMenu();
                  setActive("regularize");
                }}
              >
                Regularize
              </MenuItem>
            ) : null}
            <MenuItem
              icon={UserCog}
              onClick={() => {
                closeMenu();
                setActive("change_manager");
              }}
            >
              Change manager
            </MenuItem>
          </>
        )}
      </DropdownMenu>

      {active === "edit" ? <EditProfileDrawer employee={employee} open onClose={close} /> : null}
      {active === "promote" ? <PromoteDrawer employee={employee} open onClose={close} /> : null}
      {active === "transfer" ? <TransferDrawer employee={employee} open onClose={close} /> : null}
      {active === "salary_change" ? <SalaryChangeDrawer employee={employee} open onClose={close} /> : null}
      {active === "regularize" ? <RegularizeDrawer employee={employee} open onClose={close} /> : null}
      {active === "change_manager" ? <ChangeManagerDrawer employee={employee} open onClose={close} /> : null}
    </>
  );
}