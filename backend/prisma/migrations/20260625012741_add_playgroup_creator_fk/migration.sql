-- AddForeignKey
ALTER TABLE "playgroups" ADD CONSTRAINT "playgroups_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
